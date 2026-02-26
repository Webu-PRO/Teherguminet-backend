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
  appendGlsShipmentLog,
  createGlsShipment,
  deriveGlsParcelMetadata,
  isGlsShippingOption,
  isGlsShippingMethod,
  readGlsPickupFromMetadata,
  resolveGlsConfig,
} from "../lib/gls"

type FulfillmentEventPayload = {
  id?: string
  fulfillment_id?: string
  order_id?: string
}

const GLS_FULFILLMENT_METADATA_KEY = "gls_shipment"
const GLS_NOTIFICATION_TEMPLATE = "admin-ui"
const GLS_NOTIFICATION_CHANNEL = "feed"
const GLS_CUSTOMER_TEMPLATE = "gls-shipment-created"

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

const readShipmentParcelNumbers = (
  shipment?: Record<string, unknown> | null
) => {
  if (!shipment || typeof shipment !== "object") {
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

const readPreviousParcelNumbers = (
  shipment?: Record<string, unknown> | null
) => {
  if (!shipment || typeof shipment !== "object") {
    return []
  }

  const numbers = shipment.previous_parcel_numbers
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

const readCustomerNotifiedAt = (
  existing?: Record<string, unknown> | null
) => {
  const value = existing?.customer_notified_at
  return typeof value === "string" && value.trim() ? value : undefined
}

const readCancelledAt = (
  existing?: Record<string, unknown> | null
) => {
  const value = existing?.cancelled_at
  return typeof value === "string" && value.trim() ? value : undefined
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
  const fulfillmentId = data.fulfillment_id ?? data.id

  if (!fulfillmentId) {
    logger?.warn?.("GLS: missing fulfillment id in event payload")
    return
  }
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
      id: fulfillmentId,
    },
  })

  const fulfillment = fulfillments?.[0] as unknown as FulfillmentDTO & {
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
      `GLS: fulfillment ${fulfillmentId} missing order relation`
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

  const metadata = extractMetadata(fulfillment)
  const existingShipment =
    metadata[GLS_FULFILLMENT_METADATA_KEY] &&
    typeof metadata[GLS_FULFILLMENT_METADATA_KEY] === "object"
      ? (metadata[GLS_FULFILLMENT_METADATA_KEY] as Record<
          string,
          unknown
        >)
      : null
  const writeLogEntry = async (
    entry: Parameters<typeof appendGlsShipmentLog>[1]
  ) => {
    try {
      const updatedShipment = appendGlsShipmentLog(
        existingShipment,
        entry
      )
      await fulfillmentModuleService.updateFulfillment(fulfillment.id, {
        metadata: {
          ...metadata,
          [GLS_FULFILLMENT_METADATA_KEY]: updatedShipment,
        },
      })
    } catch (error) {
      logger?.warn?.(
        `GLS: failed to update shipment log for ${fulfillment.id}`
      )
      logger?.error?.(error as Error)
    }
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
    await writeLogEntry({
      action: "create_shipment",
      status: "error",
      message: "Missing GLS pickup point for pickup delivery option.",
      details: {
        pickup_required: true,
      },
      source: "subscriber",
    })
    logger?.warn?.(
      `GLS: missing pickup point for fulfillment ${fulfillment.id}`
    )
    return
  }

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
    await writeLogEntry({
      action: "create_shipment",
      status: "error",
      message: "Missing GLS configuration.",
      details: {
        missing,
      },
      source: "subscriber",
    })
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
    const hasBlockingErrors =
      glsErrors.length > 0 && parcelNumbers.length === 0
    const previousParcelNumbers = mergeParcelNumbers(
      readPreviousParcelNumbers(existingShipment),
      readShipmentParcelNumbers(existingShipment)
    )
    const filteredPreviousNumbers = previousParcelNumbers.filter(
      (number) => !parcelNumbers.includes(number)
    )
    const shouldNotifyCustomer =
      parcelNumbers.length > 0 &&
      Boolean(order.email?.trim()) &&
      (Boolean(readCancelledAt(existingShipment)) ||
        !readCustomerNotifiedAt(existingShipment))
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
    const labelPayload =
      !hasBlockingErrors && labelsToAdd.length
        ? [
            ...existingLabels.map((label) => ({ id: label.id })),
            ...labelsToAdd,
          ]
        : undefined

    const shipmentMetadata = {
      created_at: new Date().toISOString(),
      request: result.request,
      response: result.response,
      parcel_numbers: parcelNumbers,
      ...(glsErrors.length ? { errors: glsErrors } : {}),
      ...(filteredPreviousNumbers.length
        ? { previous_parcel_numbers: filteredPreviousNumbers }
        : {}),
      ...(!hasBlockingErrors && result.parcelIds?.length
        ? { parcel_ids: result.parcelIds }
        : {}),
      ...(!hasBlockingErrors && result.labelBase64
        ? { label_base64: result.labelBase64 }
        : {}),
    }
    const logStatus = hasBlockingErrors
      ? "error"
      : glsErrors.length
        ? "warning"
        : "success"
    const logMessage = hasBlockingErrors
      ? "GLS shipment failed. Label not created."
      : glsErrors.length
        ? "GLS returned errors during shipment creation."
        : "GLS shipment created."
    const logEntry = appendGlsShipmentLog(existingShipment, {
      action: "create_shipment",
      status: logStatus,
      message: logMessage,
      errors: glsErrors.length ? glsErrors : undefined,
      request: result.request,
      response: result.response,
      details: {
        parcel_numbers: parcelNumbers,
        parcel_ids: result.parcelIds,
        ...(hasBlockingErrors ? { blocked: true } : {}),
      },
      source: "subscriber",
    })
    const logEntries = Array.isArray(logEntry.log)
      ? logEntry.log
      : undefined
    const shipmentPayload = logEntries
      ? { ...shipmentMetadata, log: logEntries }
      : shipmentMetadata

    await fulfillmentModuleService.updateFulfillment(fulfillment.id, {
      metadata: {
        ...metadata,
        [GLS_FULFILLMENT_METADATA_KEY]: shipmentPayload,
      },
      ...(labelPayload ? { labels: labelPayload } : {}),
    })

    if (shouldNotifyCustomer && notificationModuleService) {
      const email = order.email?.trim()
      if (email) {
        const notification: CreateNotificationDTO = {
          to: email,
          channel: "email",
          template: GLS_CUSTOMER_TEMPLATE,
          data: {
            order,
            parcelNumbers,
          },
          trigger_type: "gls.shipment_created",
          resource_id: order.id,
          resource_type: "order",
        }

        try {
          await dispatchNotificationsIndividually(
            notificationModuleService,
            [notification],
            logger
          )

          await fulfillmentModuleService.updateFulfillment(
            fulfillment.id,
            {
              metadata: {
                ...metadata,
                [GLS_FULFILLMENT_METADATA_KEY]: {
                  ...shipmentPayload,
                  customer_notified_at: new Date().toISOString(),
                  customer_notified_parcels: parcelNumbers,
                },
              },
            }
          )
        } catch (error) {
          logger?.warn?.(
            `GLS: failed to send customer email for fulfillment ${fulfillment.id}`
          )
          logger?.error?.(error as Error)
        }
      }
    }
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
    await writeLogEntry({
      action: "create_shipment",
      status: "error",
      message: "GLS shipment failed.",
      errors: [message],
      source: "subscriber",
    })
    logger?.error?.(
      `GLS: failed to create shipment for fulfillment ${fulfillment.id}`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: ["order.fulfillment_created", "fulfillment.created"],
}
