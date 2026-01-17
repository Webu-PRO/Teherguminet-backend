import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type {
  FulfillmentDTO,
  IFulfillmentModuleService,
  IOrderModuleService,
  Logger,
  OrderDTO,
  OrderShippingMethodDTO,
  Query,
} from "@medusajs/types"

import {
  createGlsShipment,
  deleteGlsLabels,
  deriveGlsParcelMetadata,
  findParcelIdsByNumbers,
  getGlsParcelList,
  isGlsShippingMethod,
  isGlsShippingOption,
  readGlsPickupFromMetadata,
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
  const parcelIds = readGlsParcelIds(metadata)
  let resolvedParcelIds = parcelIds

  if (!resolvedParcelIds.length) {
    if (!parcelNumbers.length) {
      res.status(400).json({
        message:
          "GLS parcel IDs are missing. Recreate the shipment to store parcel IDs before cancelling.",
      })
      return
    }

    const { config: lookupConfig, missing: lookupMissing } =
      resolveGlsConfig()
    if (!lookupConfig) {
      res.status(400).json({
        message: `Missing GLS configuration: ${lookupMissing.join(", ")}.`,
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

    try {
      const listResult = await getGlsParcelList(lookupConfig, {
        pickupDateFrom: fromDate,
        pickupDateTo: toDate,
      })
      resolvedParcelIds = findParcelIdsByNumbers(
        listResult.response,
        parcelNumbers
      )

      if (!resolvedParcelIds.length) {
        const printResult = await getGlsParcelList(lookupConfig, {
          printDateFrom: fromDate,
          printDateTo: toDate,
        })
        resolvedParcelIds = findParcelIdsByNumbers(
          printResult.response,
          parcelNumbers
        )
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error"
      logger?.warn?.(
        `GLS: failed to lookup parcel ids for cancellation (${message})`
      )
    }
  }

  if (!resolvedParcelIds.length) {
    res.status(404).json({
      message:
        "GLS parcel IDs are missing. Increase GLS_CANCEL_LOOKBACK_DAYS or cancel the label in MyGLS.",
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
    const result = await deleteGlsLabels(resolvedParcelIds, config)
    const glsErrors = extractGlsErrorDescriptions(result.response)

    const existingLabels = Array.isArray(fulfillment.labels)
      ? fulfillment.labels
      : []
    const numbersToRemove = new Set(
      parcelNumbers.map((value) => value.trim())
    )
    const labelsToKeep = numbersToRemove.size
      ? existingLabels.filter((label) => {
          const number = label?.tracking_number
          if (!number) {
            return true
          }
          return !numbersToRemove.has(number.trim())
        })
      : []
    const labelPayload = existingLabels.length
      ? labelsToKeep.map((label) => ({ id: label.id }))
      : undefined

    await fulfillmentModuleService.updateFulfillment(fulfillment.id, {
      metadata: {
        ...metadata,
        [GLS_FULFILLMENT_METADATA_KEY]: {
          ...(metadata[GLS_FULFILLMENT_METADATA_KEY] as Record<
            string,
            unknown
          >),
          parcel_ids: resolvedParcelIds,
          cancelled_at: new Date().toISOString(),
          delete_request: result.request,
          delete_response: result.response,
        },
      },
      ...(labelPayload ? { labels: labelPayload } : {}),
    })

    res.status(200).json({
      status: glsErrors.length ? "warning" : "success",
      errors: glsErrors,
    })
  } catch (error) {
    logger?.error?.(
      `GLS: failed to cancel shipment for fulfillment ${fulfillment.id}`,
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
          parcel_numbers: parcelNumbers,
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
