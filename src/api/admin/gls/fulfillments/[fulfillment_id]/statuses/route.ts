import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type {
  FulfillmentDTO,
  Logger,
  OrderDTO,
  OrderShippingMethodDTO,
  Query,
} from "@medusajs/types"

import {
  getGlsParcelStatuses,
  isGlsShippingMethod,
  isGlsShippingOption,
  resolveGlsConfig,
} from "../../../../../../lib/gls"

type FulfillmentWithOrder = FulfillmentDTO & {
  order?: OrderDTO
  shipping_option?: {
    id?: string | null
    name?: string | null
    provider_id?: string | null
    shipping_option_type_id?: string | null
    type?: {
      id?: string | null
      code?: string | null
      label?: string | null
      description?: string | null
    } | null
    data?: Record<string, unknown> | null
    metadata?: Record<string, unknown> | null
  } | null
}

const GLS_FULFILLMENT_METADATA_KEY = "gls_shipment"

const resolveLogger = (req: MedusaRequest) => {
  try {
    return req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  } catch {
    return undefined
  }
}

const resolveShippingMethod = (
  order: OrderDTO,
  fulfillment: FulfillmentDTO
): OrderShippingMethodDTO | null => {
  const methods = order.shipping_methods ?? []

  if (!methods.length) {
    return null
  }

  if (fulfillment.shipping_option_id) {
    const match = methods.find(
      (method) =>
        method.shipping_option_id === fulfillment.shipping_option_id
    )

    if (match) {
      return match
    }
  }

  return methods.length === 1 ? methods[0] : methods.at(-1) ?? null
}

const extractMetadata = (
  fulfillment: FulfillmentDTO
): Record<string, unknown> => {
  return (fulfillment.metadata as Record<string, unknown>) ?? {}
}

const normalizeParcelNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  return null
}

const readGlsParcelNumbers = (
  metadata: Record<string, unknown>,
  labels?: Array<{ tracking_number?: string | null } | null> | null
) => {
  const shipment = metadata[GLS_FULFILLMENT_METADATA_KEY]
  if (!shipment || typeof shipment !== "object") {
    return Array.isArray(labels)
      ? labels
          .map((label) => label?.tracking_number)
          .map(normalizeParcelNumber)
          .filter((value): value is string => Boolean(value))
      : []
  }

  const numbers = (shipment as Record<string, unknown>).parcel_numbers
  if (!Array.isArray(numbers)) {
    return []
  }

  const normalized = numbers
    .map(normalizeParcelNumber)
    .filter((value): value is string => Boolean(value))

  if (normalized.length) {
    return normalized
  }

  return Array.isArray(labels)
    ? labels
        .map((label) => label?.tracking_number)
        .map(normalizeParcelNumber)
        .filter((value): value is string => Boolean(value))
    : []
}

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

type ParcelStatusEntry = {
  StatusCode?: string
  StatusDate?: string
  StatusDescription?: string
  StatusInfo?: string
  DepotCity?: string
  DepotNumber?: string
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

const resolveStatusLanguage = (order: OrderDTO) => {
  const country = order.shipping_address?.country_code
  const normalized =
    typeof country === "string" && country.trim()
      ? country.trim().toUpperCase()
      : ""

  switch (normalized) {
    case "CZ":
      return "CS"
    case "SI":
      return "SL"
    case "HR":
    case "HU":
    case "RO":
    case "SK":
      return normalized
    default:
      return "EN"
  }
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

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { fulfillment_id: fulfillmentId } = req.params

  if (!fulfillmentId) {
    res.status(400).json({ message: "Missing fulfillment id." })
    return
  }

  const logger = resolveLogger(req)
  const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    fields: [
      "id",
      "provider_id",
      "shipping_option_id",
      "metadata",
      "labels.*",
      "shipping_option.id",
      "shipping_option.name",
      "shipping_option.provider_id",
      "shipping_option.shipping_option_type_id",
      "shipping_option.type.id",
      "shipping_option.type.code",
      "shipping_option.type.label",
      "shipping_option.type.description",
      "shipping_option.data",
      "shipping_option.metadata",
      "order.id",
      "order.shipping_address.*",
      "order.shipping_methods.*",
    ],
    filters: {
      id: fulfillmentId,
    },
  })

  const fulfillment = fulfillments?.[0] as
    | FulfillmentWithOrder
    | undefined

  if (!fulfillment || !fulfillment.order) {
    res.status(404).json({ message: "Fulfillment not found." })
    return
  }

  const shippingMethod = resolveShippingMethod(
    fulfillment.order,
    fulfillment
  )
  const matchesGls =
    isGlsShippingOption(fulfillment.shipping_option) ||
    isGlsShippingMethod(shippingMethod)

  if (!matchesGls) {
    res.status(400).json({
      message: "This fulfillment is not using a GLS shipping method.",
    })
    return
  }

  const metadata = extractMetadata(fulfillment)
  const parcelNumbers = readGlsParcelNumbers(
    metadata,
    fulfillment.labels
  )
  const uniqueParcelNumbers = Array.from(new Set(parcelNumbers))

  if (!uniqueParcelNumbers.length) {
    res.status(200).json({ statuses: [] })
    return
  }

  const { config, missing } = resolveGlsConfig()
  if (!config) {
    res.status(400).json({
      message: `Missing GLS configuration: ${missing.join(", ")}.`,
    })
    return
  }

  const languageIsoCode = resolveStatusLanguage(fulfillment.order)

  try {
    const statuses = await Promise.all(
      uniqueParcelNumbers.map(async (parcelNumber) => {
        try {
          const result = await getGlsParcelStatuses(config, {
            parcelNumber,
            returnPOD: false,
            languageIsoCode,
          })
          const errors = extractGlsErrorDescriptions(result.response)
          const statusList = extractParcelStatusList(result.response)
          const latestStatus = pickLatestStatus(statusList)

          return {
            parcel_number: parcelNumber,
            status: buildStatusPayload(latestStatus),
            ...(errors.length ? { errors } : {}),
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error"
          logger?.warn?.(
            `GLS: failed to fetch parcel status for ${parcelNumber} (${message})`
          )
          return {
            parcel_number: parcelNumber,
            errors: [message],
          }
        }
      })
    )

    res.status(200).json({ statuses })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error"
    logger?.error?.("GLS: failed to load parcel statuses", error as Error)
    res.status(500).json({
      message,
    })
  }
}
