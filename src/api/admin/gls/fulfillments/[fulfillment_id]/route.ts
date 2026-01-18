import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type {
  CreateNotificationDTO,
  FulfillmentDTO,
  IFulfillmentModuleService,
  INotificationModuleService,
  IOrderModuleService,
  Logger,
  OrderDTO,
  OrderShippingMethodDTO,
  Query,
} from "@medusajs/types"

import { dispatchNotificationsIndividually } from "../../../../../lib/dispatch-notifications"
import {
  createGlsShipment,
  deleteGlsLabels,
  deriveGlsParcelMetadata,
  findParcelIdsByNumbers,
  getGlsParcelList,
  isGlsShippingMethod,
  isGlsShippingOption,
  readGlsPickupFromMetadata,
  resolveOrderReference,
  resolveGlsConfig,
} from "../../../../../lib/gls"

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
const GLS_LABEL_FILENAME_PREFIX = "gls-label"
const GLS_NOTIFICATION_TEMPLATE = "admin-ui"
const GLS_NOTIFICATION_CHANNEL = "feed"

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

const resolveOrderLabel = (order: OrderDTO) => {
  if (Number.isFinite(order.display_id)) {
    return `#${order.display_id}`
  }

  return order.id
}

const isPickupLike = (value?: string | null) => {
  if (!value) {
    return false
  }

  const normalized = value.toLowerCase()
  return (
    normalized.includes("pickup") ||
    normalized.includes("csomagpont") ||
    normalized.includes("parcelshop")
  )
}

const extractMetadata = (
  fulfillment: FulfillmentDTO
): Record<string, unknown> => {
  return (fulfillment.metadata as Record<string, unknown>) ?? {}
}

const extractGlsErrorDescriptions = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return []
  }

  const descriptions: string[] = []
  const record = payload as Record<string, unknown>

  for (const [key, value] of Object.entries(record)) {
    if (!key.toLowerCase().includes("error")) {
      continue
    }

    if (!Array.isArray(value)) {
      continue
    }

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

  return descriptions
}

const notifyGlsCancellationIssue = async (
  notificationService: INotificationModuleService | undefined,
  order: OrderDTO,
  fulfillmentId: string,
  description: string,
  logger?: Logger
) => {
  if (!notificationService) {
    return
  }

  const notification: CreateNotificationDTO = {
    to: "",
    channel: GLS_NOTIFICATION_CHANNEL,
    template: GLS_NOTIFICATION_TEMPLATE,
    data: {
      title: "GLS cancellation failed",
      description,
    },
    trigger_type: "gls.cancel_failed",
    resource_id: order.id,
    resource_type: "order",
    idempotency_key: `gls-cancel-failed-${fulfillmentId}`,
  }

  await dispatchNotificationsIndividually(
    notificationService,
    [notification],
    logger
  )
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

const extractParcelNumbers = (payload: unknown) => {
  const numbers = new Set<string>()

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
    const candidate =
      normalizeParcelNumber(record.ParcelNumberWithCheckdigit) ??
      normalizeParcelNumber(record.ParcelNumber)

    if (candidate) {
      numbers.add(candidate)
    }

    for (const value of Object.values(record)) {
      stack.push(value)
    }
  }

  return Array.from(numbers)
}

const buildTrackingUrl = (order: OrderDTO, parcelNumber: string) => {
  const country = order.shipping_address?.country_code
  const countryCode =
    typeof country === "string" && country.trim()
      ? country.trim().toUpperCase()
      : "HU"

  return `https://gls-group.com/${countryCode}/en/parcel-tracking?match=${encodeURIComponent(
    parcelNumber
  )}`
}

const shouldSkipExistingShipment = (
  metadata: Record<string, unknown>
) => {
  const existing = metadata[GLS_FULFILLMENT_METADATA_KEY]
  if (!existing) {
    return false
  }

  const cancelledAt =
    typeof (existing as Record<string, unknown>)?.cancelled_at ===
    "string"
      ? (existing as Record<string, unknown>).cancelled_at
      : undefined
  if (cancelledAt) {
    return false
  }

  return extractParcelNumbers(existing).length > 0
}

const readGlsLabel = (metadata: Record<string, unknown>) => {
  const shipment = metadata[GLS_FULFILLMENT_METADATA_KEY]
  if (!shipment || typeof shipment !== "object") {
    return null
  }

  const label = (shipment as Record<string, unknown>).label_base64
  if (typeof label !== "string") {
    return null
  }

  const trimmed = label.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.includes(",") ? trimmed.split(",").pop() ?? null : trimmed
}

const readGlsParcelIds = (metadata: Record<string, unknown>) => {
  const shipment = metadata[GLS_FULFILLMENT_METADATA_KEY]
  if (!shipment || typeof shipment !== "object") {
    return []
  }

  const ids = (shipment as Record<string, unknown>).parcel_ids
  if (!Array.isArray(ids)) {
    return []
  }

  return ids.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value)
  )
}

const readClientReference = (metadata: Record<string, unknown>) => {
  const shipment = metadata[GLS_FULFILLMENT_METADATA_KEY]
  if (!shipment || typeof shipment !== "object") {
    return null
  }

  const value = (shipment as Record<string, unknown>).client_reference
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
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

const normalizeClientReference = (value: unknown) => {
  if (typeof value !== "string") {
    return ""
  }

  return value.trim().toUpperCase()
}

const extractPrintDataInfoList = (payload: unknown) => {
  const entries: Record<string, unknown>[] = []

  if (!payload || typeof payload !== "object") {
    return entries
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
      if (key.toLowerCase() === "printdatainfolist") {
        if (Array.isArray(value)) {
          for (const entry of value) {
            if (entry && typeof entry === "object") {
              entries.push(entry as Record<string, unknown>)
            }
          }
        }
        continue
      }

      stack.push(value)
    }
  }

  return entries
}

const findParcelIdsByClientReference = (
  payload: unknown,
  reference: string
) => {
  const normalizedReference = normalizeClientReference(reference)
  if (!normalizedReference) {
    return []
  }

  const ids = new Set<number>()
  const entries = extractPrintDataInfoList(payload)

  for (const entry of entries) {
    const refCandidate =
      normalizeClientReference(entry.ClientReference) ||
      normalizeClientReference(entry.clientReference)

    if (!refCandidate || refCandidate !== normalizedReference) {
      continue
    }

    const idCandidate =
      normalizeParcelId(entry.ParcelId) ??
      normalizeParcelId(entry.parcelId)

    if (idCandidate) {
      ids.add(idCandidate)
    }
  }

  return Array.from(ids)
}

const recoverParcelIdsForCancellation = async (
  config: ReturnType<typeof resolveGlsConfig>["config"],
  params: {
    fromDate: Date
    toDate: Date
    clientReference?: string | null
    parcelNumbers?: string[]
  }
) => {
  if (!config) {
    return []
  }

  const lookups = await Promise.allSettled([
    getGlsParcelList(config, {
      printDateFrom: params.fromDate,
      printDateTo: params.toDate,
    }),
    getGlsParcelList(config, {
      pickupDateFrom: params.fromDate,
      pickupDateTo: params.toDate,
    }),
  ])

  const responses = lookups.flatMap((entry) =>
    entry.status === "fulfilled" ? [entry.value.response] : []
  )

  if (!responses.length) {
    return []
  }

  const byReference = new Set<number>()
  if (params.clientReference) {
    for (const response of responses) {
      for (const id of findParcelIdsByClientReference(
        response,
        params.clientReference
      )) {
        byReference.add(id)
      }
    }
  }

  if (byReference.size) {
    return Array.from(byReference)
  }

  if (!params.parcelNumbers?.length) {
    return []
  }

  const byNumbers = new Set<number>()
  for (const response of responses) {
    for (const id of findParcelIdsByNumbers(
      response,
      params.parcelNumbers
    )) {
      byNumbers.add(id)
    }
  }

  return Array.from(byNumbers)
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

const isNotFoundCancellationError = (value: string) => {
  const normalized = value.toLowerCase()
  return (
    normalized.includes("not exist") ||
    normalized.includes("not found") ||
    normalized.includes("not found with current settings")
  )
}

const isMissingCancellationConfirmation = (value: string) =>
  value.toLowerCase().includes("did not confirm cancellation")

const isRecoverableCancellationError = (errors: string[]) => {
  if (!errors.length) {
    return false
  }

  const hasNotFound = errors.some(isNotFoundCancellationError)
  if (!hasNotFound) {
    return false
  }

  return errors.every(
    (error) =>
      isNotFoundCancellationError(error) ||
      isMissingCancellationConfirmation(error)
  )
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
          .filter((value): value is string => Boolean(value))
      : []
  }

  const numbers = (shipment as Record<string, unknown>).parcel_numbers
  if (!Array.isArray(numbers)) {
    return []
  }

  const normalized = numbers.filter(
    (value): value is string => typeof value === "string"
  )

  if (normalized.length) {
    return normalized
  }

  return Array.isArray(labels)
    ? labels
        .map((label) => label?.tracking_number)
        .filter((value): value is string => Boolean(value))
    : []
}

const readShipmentParcelNumbers = (
  shipment: Record<string, unknown> | null
) => {
  if (!shipment || typeof shipment !== "object") {
    return []
  }

  const numbers = (shipment as Record<string, unknown>)
    .parcel_numbers
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

const readPreviousParcelNumbers = (
  shipment: Record<string, unknown> | null
) => {
  if (!shipment || typeof shipment !== "object") {
    return []
  }

  const numbers = (shipment as Record<string, unknown>)
    .previous_parcel_numbers
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

const mergeParcelNumbers = (
  current: string[],
  next: string[]
) => {
  const merged: string[] = []
  const seen = new Set<string>()

  for (const value of [...current, ...next]) {
    if (seen.has(value)) {
      continue
    }

    seen.add(value)
    merged.push(value)
  }

  return merged
}

const readGlsCancellation = (metadata: Record<string, unknown>) => {
  const shipment = metadata[GLS_FULFILLMENT_METADATA_KEY]
  if (!shipment || typeof shipment !== "object") {
    return null
  }

  const cancelledAt = (shipment as Record<string, unknown>)
    .cancelled_at
  return typeof cancelledAt === "string" ? cancelledAt : null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { fulfillment_id: fulfillmentId } = req.params

  if (!fulfillmentId) {
    res.status(400).json({ message: "Missing fulfillment id." })
    return
  }

  const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    fields: ["id", "metadata", "order.display_id"],
    filters: {
      id: fulfillmentId,
    },
  })

  const fulfillment = fulfillments?.[0] as
    | FulfillmentWithOrder
    | undefined

  if (!fulfillment) {
    res.status(404).json({ message: "Fulfillment not found." })
    return
  }

  const metadata = extractMetadata(fulfillment)
  const labelBase64 = readGlsLabel(metadata)
  if (!labelBase64) {
    res.status(404).json({
      message:
        "GLS label not found for this fulfillment. Create the GLS shipment first.",
    })
    return
  }

  const filename = `${GLS_LABEL_FILENAME_PREFIX}-${fulfillment.order?.display_id ?? fulfillment.id}.pdf`
  const buffer = Buffer.from(labelBase64, "base64")

  res.setHeader("Content-Type", "application/pdf")
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  )
  res.status(200).send(buffer)
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { fulfillment_id: fulfillmentId } = req.params

  if (!fulfillmentId) {
    res.status(400).json({ message: "Missing fulfillment id." })
    return
  }

  const logger = resolveLogger(req)
  const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const fulfillmentModuleService =
    req.scope.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT)
  let notificationModuleService: INotificationModuleService | undefined
  try {
    notificationModuleService = req.scope.resolve<INotificationModuleService>(
      Modules.NOTIFICATION
    )
  } catch {
    notificationModuleService = undefined
  }

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
      "order.display_id",
      "order.created_at",
      "order.email",
      "order.currency_code",
      "order.metadata",
      "order.shipping_address.*",
      "order.billing_address.*",
      "order.customer.*",
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

  const orderLabel = resolveOrderLabel(fulfillment.order)
  const metadata = extractMetadata(fulfillment)
  const cancelledAt = readGlsCancellation(metadata)
  if (cancelledAt) {
    res.status(409).json({
      message: "GLS label already cancelled for this fulfillment.",
    })
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

  const parcelNumbers = readGlsParcelNumbers(
    metadata,
    fulfillment.labels
  )
  const existingShipment =
    metadata[GLS_FULFILLMENT_METADATA_KEY] &&
    typeof metadata[GLS_FULFILLMENT_METADATA_KEY] === "object"
      ? (metadata[GLS_FULFILLMENT_METADATA_KEY] as Record<
          string,
          unknown
        >)
      : null
  const previousParcelNumbers =
    readPreviousParcelNumbers(existingShipment)
  const candidateParcelNumbers = mergeParcelNumbers(
    parcelNumbers,
    previousParcelNumbers
  )
  const clientReference =
    readClientReference(metadata) ??
    resolveOrderReference(fulfillment.order)

  const parcelIds = readGlsParcelIds(metadata)
  let resolvedParcelIds = parcelIds

  const { config, missing } = resolveGlsConfig()
  if (!config) {
    res.status(400).json({
      message: `Missing GLS configuration: ${missing.join(", ")}.`,
    })
    return
  }

  const now = new Date()
  const createdAt = fulfillment.order?.created_at
    ? new Date(fulfillment.order.created_at)
    : null
  const fallbackDays =
    Number(process.env.GLS_CANCEL_LOOKBACK_DAYS) || 30
  const fallbackFrom = new Date(now)
  fallbackFrom.setDate(now.getDate() - fallbackDays)
  const fromDate = createdAt
    ? new Date(createdAt.getTime() - 24 * 60 * 60 * 1000)
    : fallbackFrom
  const toDate = now

  const attemptCancellation = async (ids: number[]) => {
    const result = await deleteGlsLabels(ids, config)
    const glsErrors = extractGlsErrorDescriptions(result.response)
    const deletedIds = extractDeleteSuccessIds(result.response)
    const deletedSet = new Set(deletedIds)
    const missingDeletes = ids.filter((id) => !deletedSet.has(id))
    const errors = [...glsErrors]
    if (missingDeletes.length) {
      errors.push(
        `GLS did not confirm cancellation for parcel IDs: ${missingDeletes.join(", ")}`
      )
    }

    return {
      errors,
      request: result.request,
      response: result.response,
    }
  }

  try {
    let cancelResult:
      | { errors: string[]; request: Record<string, unknown>; response: unknown }
      | null = null
    let attemptedRecovery = false

    if (resolvedParcelIds.length) {
      cancelResult = await attemptCancellation(resolvedParcelIds)
    }

    const shouldRecover =
      !resolvedParcelIds.length ||
      (cancelResult
        ? isRecoverableCancellationError(cancelResult.errors)
        : false)

    if (shouldRecover) {
      attemptedRecovery = true
      const recoveredIds = await recoverParcelIdsForCancellation(
        config,
        {
          fromDate,
          toDate,
          clientReference,
          parcelNumbers: candidateParcelNumbers,
        }
      )

      if (recoveredIds.length) {
        resolvedParcelIds = recoveredIds
        cancelResult = await attemptCancellation(resolvedParcelIds)
      }
    }

    if (!resolvedParcelIds.length) {
      const message =
        "GLS parcel IDs could not be recovered. Cancel the label in MyGLS."
      const updatedShipment = {
        ...(existingShipment ?? {}),
        client_reference: clientReference,
      }

      await fulfillmentModuleService.updateFulfillment(fulfillment.id, {
        metadata: {
          ...metadata,
          [GLS_FULFILLMENT_METADATA_KEY]: updatedShipment,
        },
      })

      await notifyGlsCancellationIssue(
        notificationModuleService,
        fulfillment.order,
        fulfillment.id,
        `Order ${orderLabel}: ${message}`,
        logger
      )

      res.status(200).json({
        status: "warning",
        errors: [message],
        needs_manual_cancel: true,
      })
      return
    }

    const errors = cancelResult?.errors ?? []
    const shouldMarkCancelled =
      errors.length === 0 || isRecoverableCancellationError(errors)
    const responseErrors = shouldMarkCancelled ? [] : errors
    const updatedShipment = {
      ...(existingShipment ?? {}),
      client_reference: clientReference,
      parcel_ids: resolvedParcelIds,
      ...(cancelResult
        ? {
            delete_request: cancelResult.request,
            delete_response: cancelResult.response,
          }
        : {}),
      ...(shouldMarkCancelled
        ? { cancelled_at: new Date().toISOString() }
        : {}),
    }

    await fulfillmentModuleService.updateFulfillment(fulfillment.id, {
      metadata: {
        ...metadata,
        [GLS_FULFILLMENT_METADATA_KEY]: updatedShipment,
      },
    })

    const email = fulfillment.order?.email?.trim()
    if (shouldMarkCancelled && email && notificationModuleService) {
      const notification: CreateNotificationDTO = {
        to: email,
        channel: "email",
        template: "gls-label-cancelled",
        data: {
          order: fulfillment.order,
          parcelNumbers,
        },
        trigger_type: "gls.label_cancelled",
        resource_id: fulfillment.order.id,
        resource_type: "order",
      }

      await dispatchNotificationsIndividually(
        notificationModuleService,
        [notification],
        logger
      )
    }

    const needsManualCancel =
      !shouldMarkCancelled &&
      (attemptedRecovery
        ? isRecoverableCancellationError(errors)
        : false)

    if (responseErrors.length) {
      const preview = responseErrors.slice(0, 3).join("; ")
      await notifyGlsCancellationIssue(
        notificationModuleService,
        fulfillment.order,
        fulfillment.id,
        `Order ${orderLabel}: GLS cancellation returned errors: ${preview}`,
        logger
      )
    }

    res.status(200).json({
      status: responseErrors.length ? "warning" : "success",
      errors: responseErrors,
      ...(needsManualCancel ? { needs_manual_cancel: true } : {}),
    })
  } catch (error) {
    logger?.error?.(
      `GLS: failed to cancel shipment for fulfillment ${fulfillment.id}`,
      error as Error
    )
    const message =
      error instanceof Error && error.message
        ? error.message
        : "GLS cancellation failed."
    await notifyGlsCancellationIssue(
      notificationModuleService,
      fulfillment.order,
      fulfillment.id,
      `Order ${orderLabel}: GLS cancellation request failed: ${message}`,
      logger
    )
    res.status(500).json({
      message,
    })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { fulfillment_id: fulfillmentId } = req.params

  if (!fulfillmentId) {
    res.status(400).json({ message: "Missing fulfillment id." })
    return
  }

  const logger = resolveLogger(req)
  const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const fulfillmentModuleService =
    req.scope.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT)
  const orderModuleService =
    req.scope.resolve<IOrderModuleService>(Modules.ORDER)

  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    fields: [
      "id",
      "provider_id",
      "shipping_option_id",
      "metadata",
      "data",
      "labels.*",
      "delivery_address.*",
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
      "order.display_id",
      "order.email",
      "order.currency_code",
      "order.total",
      "order.metadata",
      "order.items.*",
      "order.items.variant.*",
      "order.items.variant.product.*",
      "order.items.variant.inventory_items.inventory.*",
      "order.shipping_address.*",
      "order.billing_address.*",
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

  const order = fulfillment.order
  const shippingMethod = resolveShippingMethod(order, fulfillment)
  const matchesGls =
    isGlsShippingOption(fulfillment.shipping_option) ||
    isGlsShippingMethod(shippingMethod)

  if (!matchesGls) {
    res.status(400).json({
      message: "This fulfillment is not using a GLS shipping method.",
    })
    return
  }

  const glsPickup = readGlsPickupFromMetadata(order.metadata)
  const pickupHint =
    isPickupLike(shippingMethod?.name) ||
    isPickupLike(fulfillment.shipping_option?.name) ||
    isPickupLike(fulfillment.shipping_option?.type?.label) ||
    isPickupLike(fulfillment.shipping_option?.type?.description)
  if (!glsPickup && pickupHint) {
    res.status(400).json({
      message:
        "GLS pickup point is missing for a pickup delivery option.",
    })
    return
  }

  const metadata = extractMetadata(fulfillment)
  if (shouldSkipExistingShipment(metadata)) {
    res.status(409).json({
      message: "GLS shipment already created for this fulfillment.",
    })
    return
  }

  const { config, missing } = resolveGlsConfig()
  if (!config) {
    res.status(400).json({
      message: `Missing GLS configuration: ${missing.join(", ")}.`,
    })
    return
  }

  try {
    const { metadata: updatedOrderMetadata, updates } =
      deriveGlsParcelMetadata(
        order,
        config.parcelDefaults,
        config.dimensionUnit
      )
    if (Object.keys(updates).length) {
      order.metadata = updatedOrderMetadata
      await orderModuleService.updateOrders(order.id, {
        metadata: updatedOrderMetadata,
      })
    }

    const result = await createGlsShipment(
      {
        order,
        fulfillment,
        pickup: glsPickup ?? undefined,
      },
      config
    )

    const glsErrors = extractGlsErrorDescriptions(result.response)
    const parcelNumbers = extractParcelNumbers(result.response)
    const clientReference = resolveOrderReference(order)
    const existingShipment = metadata[
      GLS_FULFILLMENT_METADATA_KEY
    ] as Record<string, unknown> | null
    const previousParcelNumbers = mergeParcelNumbers(
      readPreviousParcelNumbers(existingShipment),
      readShipmentParcelNumbers(existingShipment)
    )
    const filteredPreviousNumbers = previousParcelNumbers.filter(
      (number) => !parcelNumbers.includes(number)
    )
    const existingLabels = Array.isArray(fulfillment.labels)
      ? fulfillment.labels
      : []
    const existingTrackingNumbers = new Set(
      existingLabels
        .map((label) => label.tracking_number)
        .filter((value): value is string => Boolean(value))
    )
    const newParcelNumbers = parcelNumbers.filter(
      (number) => !existingTrackingNumbers.has(number)
    )
    const labelsToAdd = newParcelNumbers.map((number) => {
      const trackingUrl = buildTrackingUrl(order, number)
      return {
        tracking_number: number,
        tracking_url: trackingUrl,
        label_url: trackingUrl,
      }
    })
    const labelPayload = labelsToAdd.length
      ? [
          ...existingLabels.map((label) => ({ id: label.id })),
          ...labelsToAdd,
        ]
      : undefined

    await fulfillmentModuleService.updateFulfillment(fulfillment.id, {
      metadata: {
        ...metadata,
        [GLS_FULFILLMENT_METADATA_KEY]: {
          created_at: new Date().toISOString(),
          request: result.request,
          response: result.response,
          client_reference: clientReference,
          parcel_numbers: parcelNumbers,
          ...(filteredPreviousNumbers.length
            ? { previous_parcel_numbers: filteredPreviousNumbers }
            : {}),
          ...(result.parcelIds?.length
            ? { parcel_ids: result.parcelIds }
            : {}),
          ...(result.labelBase64
            ? { label_base64: result.labelBase64 }
            : {}),
        },
      },
      ...(labelPayload ? { labels: labelPayload } : {}),
    })

    res.status(200).json({
      status: glsErrors.length ? "warning" : "success",
      parcel_numbers: parcelNumbers,
      errors: glsErrors,
    })
  } catch (error) {
    logger?.error?.(
      `GLS: failed to create shipment for fulfillment ${fulfillment.id}`,
      error as Error
    )
    res.status(500).json({
      message:
        error instanceof Error && error.message
          ? error.message
          : "GLS shipment failed.",
    })
  }
}
