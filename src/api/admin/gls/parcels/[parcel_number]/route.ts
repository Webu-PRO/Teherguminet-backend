import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type {
  FulfillmentDTO,
  IFulfillmentModuleService,
  Logger,
  Query,
} from "@medusajs/types"

import {
  deleteGlsLabels,
  findParcelIdsByNumbers,
  getGlsParcelList,
  getGlsParcelStatuses,
  resolveGlsConfig,
} from "../../../../../lib/gls"

type ParcelStatusEntry = {
  StatusCode?: string
  StatusDate?: string
  StatusDescription?: string
  StatusInfo?: string
  DepotCity?: string
  DepotNumber?: string
}

type LabelSummary = {
  tracking_number?: string | null
}

type FulfillmentSummary = FulfillmentDTO & {
  labels?: Array<LabelSummary | null> | null
}

const resolveLogger = (req: MedusaRequest) => {
  try {
    return req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  } catch {
    return undefined
  }
}

const normalizeParcelNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    const digitsOnly = trimmed.replace(/\D/g, "")
    return digitsOnly ? digitsOnly : trimmed
  }

  return null
}

const extractMetadata = (fulfillment: FulfillmentSummary) => {
  return (fulfillment.metadata as Record<string, unknown>) ?? {}
}

const readGlsShipment = (metadata: Record<string, unknown>) => {
  const shipment = metadata.gls_shipment
  if (!shipment || typeof shipment !== "object") {
    return null
  }

  return shipment as Record<string, unknown>
}

const readShipmentParcelNumbers = (
  shipment: Record<string, unknown> | null
) => {
  if (!shipment) {
    return []
  }

  const numbers = shipment.parcel_numbers
  if (!Array.isArray(numbers)) {
    return []
  }

  const parsed: string[] = []
  const seen = new Set<string>()

  for (const value of numbers) {
    if (typeof value !== "string") {
      continue
    }

    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }

    seen.add(trimmed)
    parsed.push(trimmed)
  }

  return parsed
}

const readLabelParcelNumbers = (
  labels?: Array<LabelSummary | null> | null
) => {
  if (!Array.isArray(labels)) {
    return []
  }

  const parsed: string[] = []
  const seen = new Set<string>()

  for (const label of labels) {
    const value = label?.tracking_number
    if (typeof value !== "string") {
      continue
    }

    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }

    seen.add(trimmed)
    parsed.push(trimmed)
  }

  return parsed
}

const hasParcelNumber = (values: string[], target: string) =>
  values.some((value) => normalizeParcelNumber(value) === target)

const isParcelNotExistsError = (value: string) => {
  const normalized = value.toLowerCase()
  return (
    normalized.includes("parcel id") && normalized.includes("not exist")
  )
}

const isMissingCancellationConfirmation = (value: string) =>
  value.toLowerCase().includes("did not confirm cancellation")

const extractGlsErrorDescriptions = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return []
  }

  const descriptions: string[] = []
  const seen = new Set<object>()
  const stack: unknown[] = [payload]

  while (stack.length) {
    const current = stack.pop()
    if (!current || typeof current !== "object") {
      continue
    }

    if (seen.has(current as object)) {
      continue
    }
    seen.add(current as object)

    if (Array.isArray(current)) {
      for (const entry of current) {
        stack.push(entry)
      }
      continue
    }

    const record = current as Record<string, unknown>
    for (const [key, value] of Object.entries(record)) {
      if (key.toLowerCase().includes("error") && Array.isArray(value)) {
        for (const entry of value) {
          if (!entry || typeof entry !== "object") {
            continue
          }

          const errorRecord = entry as Record<string, unknown>
          const code =
            typeof errorRecord.ErrorCode === "number"
              ? errorRecord.ErrorCode
              : undefined
          const description =
            typeof errorRecord.ErrorDescription === "string"
              ? errorRecord.ErrorDescription
              : undefined

          if (description && typeof code === "number") {
            descriptions.push(`${code}: ${description}`)
          } else if (description) {
            descriptions.push(description)
          } else if (typeof code === "number") {
            descriptions.push(`Error ${code}`)
          }
        }
      }

      stack.push(value)
    }
  }

  return descriptions
}

const parseParcelStatusEntry = (
  value: unknown
): ParcelStatusEntry | null => {
  if (!value || typeof value !== "object") {
    return null
  }

  const record = value as Record<string, unknown>
  const entry: ParcelStatusEntry = {
    StatusCode:
      typeof record.StatusCode === "string"
        ? record.StatusCode
        : undefined,
    StatusDate:
      typeof record.StatusDate === "string"
        ? record.StatusDate
        : undefined,
    StatusDescription:
      typeof record.StatusDescription === "string"
        ? record.StatusDescription
        : undefined,
    StatusInfo:
      typeof record.StatusInfo === "string"
        ? record.StatusInfo
        : undefined,
    DepotCity:
      typeof record.DepotCity === "string"
        ? record.DepotCity
        : undefined,
    DepotNumber:
      typeof record.DepotNumber === "string"
        ? record.DepotNumber
        : undefined,
  }

  if (
    !entry.StatusCode &&
    !entry.StatusDate &&
    !entry.StatusDescription &&
    !entry.StatusInfo &&
    !entry.DepotCity &&
    !entry.DepotNumber
  ) {
    return null
  }

  return entry
}

const extractParcelStatusEntries = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map(parseParcelStatusEntry)
      .filter((entry): entry is ParcelStatusEntry => Boolean(entry))
  }

  if (!value || typeof value !== "object") {
    return []
  }

  const record = value as Record<string, unknown>

  if (Array.isArray(record.ParcelStatus)) {
    return record.ParcelStatus
      .map(parseParcelStatusEntry)
      .filter((entry): entry is ParcelStatusEntry => Boolean(entry))
  }

  if (Array.isArray(record.parcelStatus)) {
    return record.parcelStatus
      .map(parseParcelStatusEntry)
      .filter((entry): entry is ParcelStatusEntry => Boolean(entry))
  }

  const direct = parseParcelStatusEntry(record)
  return direct ? [direct] : []
}

const extractParcelStatusList = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return []
  }

  const seen = new Set<object>()
  const stack: unknown[] = [payload]

  while (stack.length) {
    const current = stack.pop()
    if (!current || typeof current !== "object") {
      continue
    }

    if (seen.has(current as object)) {
      continue
    }
    seen.add(current as object)

    if (Array.isArray(current)) {
      const entries = extractParcelStatusEntries(current)
      if (entries.length) {
        return entries
      }

      for (const item of current) {
        stack.push(item)
      }
      continue
    }

    const record = current as Record<string, unknown>
    for (const [key, value] of Object.entries(record)) {
      if (key.toLowerCase() === "parcelstatuslist") {
        const entries = extractParcelStatusEntries(value)
        if (entries.length) {
          return entries
        }
      }

      stack.push(value)
    }
  }

  return []
}

const parseStatusDate = (value: unknown) => {
  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const match = trimmed.match(/\/Date\((\d+)\)\//)
  if (match) {
    const parsed = Number(match[1])
    return Number.isFinite(parsed) ? parsed : null
  }

  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? null : parsed
}

const pickLatestStatus = (statuses: ParcelStatusEntry[]) => {
  if (!statuses.length) {
    return null
  }

  let latest = statuses[0]
  let latestTimestamp = parseStatusDate(latest.StatusDate) ?? null

  for (const entry of statuses.slice(1)) {
    const timestamp = parseStatusDate(entry.StatusDate)
    if (timestamp === null) {
      continue
    }

    if (latestTimestamp === null || timestamp > latestTimestamp) {
      latest = entry
      latestTimestamp = timestamp
    }
  }

  return latest
}

const buildStatusPayload = (status: ParcelStatusEntry | null) => {
  if (!status) {
    return undefined
  }

  const payload: Record<string, string> = {}

  if (status.StatusCode) {
    payload.code = status.StatusCode
  }
  if (status.StatusDescription) {
    payload.description = status.StatusDescription
  }
  if (status.StatusDate) {
    payload.date = status.StatusDate
  }
  if (status.StatusInfo) {
    payload.info = status.StatusInfo
  }
  if (status.DepotCity) {
    payload.depot_city = status.DepotCity
  }
  if (status.DepotNumber) {
    payload.depot_number = status.DepotNumber
  }

  return Object.keys(payload).length ? payload : undefined
}

const normalizeParcelId = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value)
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.round(parsed)
    }
  }

  return null
}

const collectDeleteSuccessIds = (
  value: unknown,
  ids: Set<number>
) => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectDeleteSuccessIds(entry, ids)
    }
    return
  }

  if (typeof value === "number") {
    ids.add(Math.round(value))
    return
  }

  if (typeof value === "string") {
    const parsed = normalizeParcelId(value)
    if (parsed) {
      ids.add(parsed)
    }
    return
  }

  if (!value || typeof value !== "object") {
    return
  }

  const record = value as Record<string, unknown>
  const candidate =
    normalizeParcelId(record.ParcelId) ??
    normalizeParcelId(record.parcelId)
  if (candidate) {
    ids.add(candidate)
  }

  for (const entry of Object.values(record)) {
    collectDeleteSuccessIds(entry, ids)
  }
}

const extractDeleteSuccessIds = (payload: unknown) => {
  const ids = new Set<number>()

  if (!payload || typeof payload !== "object") {
    return []
  }

  const seen = new Set<object>()
  const stack: unknown[] = [payload]

  while (stack.length) {
    const current = stack.pop()
    if (!current || typeof current !== "object") {
      continue
    }

    if (seen.has(current as object)) {
      continue
    }
    seen.add(current as object)

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item)
      }
      continue
    }

    const record = current as Record<string, unknown>
    for (const [key, value] of Object.entries(record)) {
      if (key.toLowerCase().includes("successfullydeleted")) {
        collectDeleteSuccessIds(value, ids)
      }

      stack.push(value)
    }
  }

  return Array.from(ids)
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { parcel_number: parcelNumberParam } = req.params

  const parcelNumber = normalizeParcelNumber(parcelNumberParam)
  if (!parcelNumber) {
    res.status(400).json({ message: "Missing parcel number." })
    return
  }

  const { config, missing } = resolveGlsConfig()
  if (!config) {
    res.status(400).json({
      message: `Missing GLS configuration: ${missing.join(", ")}.`,
    })
    return
  }

  const langParam = req.query?.lang
  const languageIsoCode =
    typeof langParam === "string" && langParam.trim()
      ? langParam.trim().toUpperCase()
      : undefined

  try {
    const result = await getGlsParcelStatuses(config, {
      parcelNumber,
      returnPOD: false,
      languageIsoCode,
    })
    const errors = extractGlsErrorDescriptions(result.response)
    const statusList = extractParcelStatusList(result.response)
    const latestStatus = pickLatestStatus(statusList)
    const statusPayload = buildStatusPayload(latestStatus)
    const listPayload = statusList
      .map((entry) => buildStatusPayload(entry))
      .filter((entry): entry is Record<string, string> =>
        Boolean(entry)
      )

    res.status(200).json({
      parcel_number: parcelNumber,
      status: statusPayload,
      status_list: listPayload,
      ...(errors.length ? { errors } : {}),
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error"
    res.status(500).json({ message })
  }
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { parcel_number: parcelNumberParam } = req.params

  const parcelNumber = normalizeParcelNumber(parcelNumberParam)
  if (!parcelNumber) {
    res.status(400).json({ message: "Missing parcel number." })
    return
  }

  const logger = resolveLogger(req)
  const { config, missing } = resolveGlsConfig()
  if (!config) {
    res.status(400).json({
      message: `Missing GLS configuration: ${missing.join(", ")}.`,
    })
    return
  }

  const now = new Date()
  const fallbackDays =
    Number(process.env.GLS_CANCEL_LOOKBACK_DAYS) || 30
  const fromDate = new Date(now)
  fromDate.setDate(now.getDate() - fallbackDays)
  const toDate = now

  let parcelIds: number[] = []

  try {
    const listResult = await getGlsParcelList(config, {
      pickupDateFrom: fromDate,
      pickupDateTo: toDate,
    })
    parcelIds = findParcelIdsByNumbers(listResult.response, [
      parcelNumber,
    ])

    if (!parcelIds.length) {
      const printResult = await getGlsParcelList(config, {
        printDateFrom: fromDate,
        printDateTo: toDate,
      })
      parcelIds = findParcelIdsByNumbers(printResult.response, [
        parcelNumber,
      ])
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error"
    logger?.warn?.(
      `GLS: failed to lookup parcel id for cancellation (${message})`
    )
  }

  if (!parcelIds.length) {
    res.status(404).json({
      message:
        "GLS parcel ID not found. Increase GLS_CANCEL_LOOKBACK_DAYS or cancel the label in MyGLS.",
    })
    return
  }

  try {
    const result = await deleteGlsLabels(parcelIds, config)
    const glsErrors = extractGlsErrorDescriptions(result.response)
    const deletedIds = extractDeleteSuccessIds(result.response)
    const deletedSet = new Set(deletedIds)
    const missingDeletes = parcelIds.filter(
      (id) => !deletedSet.has(id)
    )
    const errors = [...glsErrors]
    if (missingDeletes.length) {
      errors.push(
        `GLS did not confirm cancellation for parcel IDs: ${missingDeletes.join(", ")}`
      )
    }
    const hasNotExistsError = glsErrors.some(isParcelNotExistsError)
    const shouldMarkCancelled =
      errors.length === 0 ||
      (hasNotExistsError &&
        errors.every(
          (error) =>
            isParcelNotExistsError(error) ||
            isMissingCancellationConfirmation(error)
        ))
    const responseErrors = shouldMarkCancelled ? [] : errors

    const fulfillmentIdParam = req.query?.fulfillment_id
    const fulfillmentId =
      typeof fulfillmentIdParam === "string"
        ? fulfillmentIdParam.trim()
        : null

    if (fulfillmentId) {
      try {
        const query = req.scope.resolve<Query>(
          ContainerRegistrationKeys.QUERY
        )
        const fulfillmentModuleService =
          req.scope.resolve<IFulfillmentModuleService>(
            Modules.FULFILLMENT
          )
        const { data: fulfillments } = await query.graph({
          entity: "fulfillment",
          fields: ["id", "metadata", "labels.*"],
          filters: {
            id: fulfillmentId,
          },
        })
        const fulfillment = fulfillments?.[0] as
          | FulfillmentSummary
          | undefined

        if (fulfillment) {
          const metadata = extractMetadata(fulfillment)
          const shipment = readGlsShipment(metadata)
          const shipmentNumbers = readShipmentParcelNumbers(shipment)
          const labelNumbers = readLabelParcelNumbers(fulfillment.labels)
          const matchesParcel =
            hasParcelNumber(shipmentNumbers, parcelNumber) ||
            hasParcelNumber(labelNumbers, parcelNumber)

          if (matchesParcel) {
            const updatedShipment = {
              ...(shipment ?? {}),
              parcel_ids: parcelIds,
              delete_request: result.request,
              delete_response: result.response,
              ...(shouldMarkCancelled
                ? { cancelled_at: new Date().toISOString() }
                : {}),
            }

            await fulfillmentModuleService.updateFulfillment(
              fulfillment.id,
              {
                metadata: {
                  ...metadata,
                  gls_shipment: updatedShipment,
                },
              }
            )
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error"
        logger?.warn?.(
          `GLS: failed to update fulfillment metadata for parcel cancellation (${message})`
        )
      }
    }

    res.status(200).json({
      status: responseErrors.length ? "warning" : "success",
      parcel_ids: parcelIds,
      errors: responseErrors,
    })
  } catch (error) {
    logger?.error?.(
      `GLS: failed to cancel parcel ${parcelNumber}`,
      error as Error
    )
    res.status(500).json({
      message:
        error instanceof Error && error.message
          ? error.message
          : "GLS cancellation failed.",
    })
  }
}
