import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
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

import { dispatchNotificationsIndividually } from "../lib/dispatch-notifications"
import {
  createGlsShipment,
  deriveGlsParcelMetadata,
  isGlsShippingOption,
  isGlsShippingMethod,
  readGlsPickupFromMetadata,
  resolveGlsConfig,
} from "../lib/gls"

type FulfillmentEventPayload = {
  id: string
}

const GLS_FULFILLMENT_METADATA_KEY = "gls_shipment"
const GLS_NOTIFICATION_TEMPLATE = "admin-ui"
const GLS_NOTIFICATION_CHANNEL = "feed"

const resolveLogger = (container: SubscriberArgs["container"]) => {
  try {
    return container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
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

const buildGlsNotification = ({
  order,
  fulfillmentId,
  kind,
  title,
  description,
}: {
  order: OrderDTO
  fulfillmentId: string
  kind: string
  title: string
  description: string
}): CreateNotificationDTO => ({
  to: "",
  channel: GLS_NOTIFICATION_CHANNEL,
  template: GLS_NOTIFICATION_TEMPLATE,
  data: {
    title,
    description,
  },
  trigger_type: `gls.${kind}`,
  resource_id: order.id,
  resource_type: "order",
  idempotency_key: `gls-${kind}-${fulfillmentId}`,
})

const notifyGlsIssue = async (
  notificationService: INotificationModuleService | undefined,
  order: OrderDTO,
  fulfillmentId: string,
  kind: string,
  title: string,
  description: string,
  logger?: Logger
) => {
  if (!notificationService) {
    return
  }

  await dispatchNotificationsIndividually(
    notificationService,
    [
      buildGlsNotification({
        order,
        fulfillmentId,
        kind,
        title,
        description,
      }),
    ],
    logger
  )
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

export default async function fulfillmentCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<FulfillmentEventPayload>) {
  const logger = resolveLogger(container)
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const notificationModuleService =
    container.resolve<INotificationModuleService>(Modules.NOTIFICATION)
  const fulfillmentModuleService =
    container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT)
  const orderModuleService =
    container.resolve<IOrderModuleService>(Modules.ORDER)

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
      id: data.id,
    },
  })

  const fulfillment = fulfillments?.[0] as FulfillmentDTO & {
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

  if (!fulfillment || !fulfillment.order) {
    logger?.warn?.(
      `GLS: fulfillment ${data.id} missing order relation`
    )
    return
  }

  const order = fulfillment.order
  const shippingMethod = resolveShippingMethod(order, fulfillment)
  const matchesGls =
    isGlsShippingOption(fulfillment.shipping_option) ||
    isGlsShippingMethod(shippingMethod)
  if (!matchesGls) {
    return
  }

  const glsPickup = readGlsPickupFromMetadata(order.metadata)
  const pickupHint =
    isPickupLike(shippingMethod?.name) ||
    isPickupLike(fulfillment.shipping_option?.name) ||
    isPickupLike(fulfillment.shipping_option?.type?.label) ||
    isPickupLike(fulfillment.shipping_option?.type?.description)
  if (!glsPickup && pickupHint) {
    await notifyGlsIssue(
      notificationModuleService,
      order,
      fulfillment.id,
      "missing-pickup",
      "GLS shipment missing pickup point",
      `Order ${resolveOrderLabel(order)} requires a GLS pickup point, but none was provided.`,
      logger
    )
    logger?.warn?.(
      `GLS: missing pickup point for fulfillment ${fulfillment.id}`
    )
    return
  }

  const metadata = extractMetadata(fulfillment)
  if (shouldSkipExistingShipment(metadata)) {
    return
  }

  const { config, missing } = resolveGlsConfig()
  if (!config) {
    await notifyGlsIssue(
      notificationModuleService,
      order,
      fulfillment.id,
      "missing-config",
      "GLS configuration missing",
      `Order ${resolveOrderLabel(order)} could not be sent to GLS. Missing config: ${missing.join(", ")}.`,
      logger
    )
    logger?.warn?.(
      `GLS: missing config (${missing.join(", ")})`
    )
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
    if (glsErrors.length) {
      const preview = glsErrors.slice(0, 3).join("; ")
      await notifyGlsIssue(
        notificationModuleService,
        order,
        fulfillment.id,
        "api-errors",
        "GLS shipment returned errors",
        `Order ${resolveOrderLabel(order)} was sent to GLS but returned errors: ${preview}`,
        logger
      )
    }

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
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unknown error"
    await notifyGlsIssue(
      notificationModuleService,
      order,
      fulfillment.id,
      "request-failed",
      "GLS shipment failed",
      `Order ${resolveOrderLabel(order)} failed to send to GLS: ${message}`,
      logger
    )
    logger?.error?.(
      `GLS: failed to create shipment for fulfillment ${fulfillment.id}`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: ["order.fulfillment_created", "fulfillment.created"],
}
