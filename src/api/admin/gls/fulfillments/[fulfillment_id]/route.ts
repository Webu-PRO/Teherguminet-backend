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
  deriveGlsParcelMetadata,
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

  return extractParcelNumbers(existing).length > 0
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
      deriveGlsParcelMetadata(order, config.parcelDefaults)
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
