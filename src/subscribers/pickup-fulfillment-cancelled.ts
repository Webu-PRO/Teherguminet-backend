import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type {
  CreateNotificationDTO,
  INotificationModuleService,
  IOrderModuleService,
  Logger,
  OrderDTO,
  OrderShippingMethodDTO,
  Query,
} from "@medusajs/types"

import { dispatchNotificationsIndividually } from "../lib/dispatch-notifications"
import { isPickupShippingMethod } from "../lib/own-delivery-shipping"

type OrderUpdatedPayload = {
  id?: string
  order_id?: string
  order?: {
    id?: string
  }
}

const PICKUP_CANCELLED_TEMPLATE = "order-pickup-cancelled"
const PICKUP_READY_ACTIVE_ORDER_METADATA_KEY = "pickup_ready_active"
const PICKUP_READY_LAST_FULFILLMENT_ID_ORDER_METADATA_KEY =
  "pickup_ready_last_fulfillment_id"
const PICKUP_CANCELLED_LAST_FULFILLMENT_ID_ORDER_METADATA_KEY =
  "pickup_cancelled_last_fulfillment_id"
const PICKUP_CANCELLED_SENT_AT_ORDER_METADATA_KEY =
  "pickup_cancelled_email_sent_at"

const resolveLogger = (container: SubscriberArgs["container"]) => {
  try {
    return container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  } catch {
    return undefined
  }
}

const resolveOrderId = (payload: OrderUpdatedPayload) => {
  if (typeof payload.id === "string" && payload.id.trim()) {
    return payload.id.trim()
  }

  if (typeof payload.order_id === "string" && payload.order_id.trim()) {
    return payload.order_id.trim()
  }

  if (typeof payload.order?.id === "string" && payload.order.id.trim()) {
    return payload.order.id.trim()
  }

  return null
}

const resolveMetadata = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

const isReadyActive = (value: unknown) => {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return normalized === "true" || normalized === "1" || normalized === "yes"
  }

  return false
}

const asTrimmedString = (value: unknown) => {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

const hasPickupShippingMethod = (order: OrderDTO) => {
  const methods = (order.shipping_methods ?? []) as OrderShippingMethodDTO[]
  return methods.some((method) => isPickupShippingMethod(method))
}

const isNotFulfilled = (value: unknown) =>
  typeof value === "string" && value.trim().toLowerCase() === "not_fulfilled"

const resolveFulfillmentStatus = (order: OrderDTO) =>
  (order as unknown as { fulfillment_status?: unknown }).fulfillment_status

export default async function pickupFulfillmentCancelledHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderUpdatedPayload>) {
  const orderId = resolveOrderId(data)
  if (!orderId) {
    return
  }

  const logger = resolveLogger(container)
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const orderModuleService = container.resolve<IOrderModuleService>(Modules.ORDER)
  const notificationModuleService =
    container.resolve<INotificationModuleService>(Modules.NOTIFICATION)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "fulfillment_status",
      "metadata",
      "total",
      "subtotal",
      "shipping_total",
      "item_total",
      "items.*",
      "shipping_address.*",
      "billing_address.*",
      "customer.*",
      "shipping_methods.*",
    ],
    filters: {
      id: orderId,
    },
  })

  const order = orders?.[0] as unknown as OrderDTO | undefined
  if (!order) {
    return
  }

  const metadata = resolveMetadata(order.metadata)
  if (!isReadyActive(metadata[PICKUP_READY_ACTIVE_ORDER_METADATA_KEY])) {
    return
  }

  if (!isNotFulfilled(resolveFulfillmentStatus(order))) {
    return
  }

  if (!hasPickupShippingMethod(order)) {
    return
  }

  const email = order.email?.trim()
  if (!email) {
    return
  }

  const lastReadyFulfillmentId = asTrimmedString(
    metadata[PICKUP_READY_LAST_FULFILLMENT_ID_ORDER_METADATA_KEY]
  )
  const lastCancelledFulfillmentId = asTrimmedString(
    metadata[PICKUP_CANCELLED_LAST_FULFILLMENT_ID_ORDER_METADATA_KEY]
  )

  if (
    lastReadyFulfillmentId &&
    lastCancelledFulfillmentId &&
    lastReadyFulfillmentId === lastCancelledFulfillmentId
  ) {
    return
  }

  const notification: CreateNotificationDTO = {
    to: email,
    channel: "email",
    template: PICKUP_CANCELLED_TEMPLATE,
    data: {
      order,
      cancelled_fulfillment_id: lastReadyFulfillmentId,
    },
    trigger_type: "order.fulfillment_cancelled",
    resource_id: order.id,
    resource_type: "order",
    idempotency_key: lastReadyFulfillmentId
      ? `${PICKUP_CANCELLED_TEMPLATE}-${lastReadyFulfillmentId}`
      : undefined,
  }

  try {
    const sentAt = new Date().toISOString()

    await dispatchNotificationsIndividually(
      notificationModuleService,
      [notification],
      logger
    )

    await orderModuleService.updateOrders(order.id, {
      metadata: {
        ...metadata,
        [PICKUP_READY_ACTIVE_ORDER_METADATA_KEY]: false,
        [PICKUP_CANCELLED_LAST_FULFILLMENT_ID_ORDER_METADATA_KEY]:
          lastReadyFulfillmentId,
        [PICKUP_CANCELLED_SENT_AT_ORDER_METADATA_KEY]: sentAt,
      },
    })
  } catch (error) {
    logger?.warn?.(
      `pickup-fulfillment-cancelled: failed for order ${order.id}`
    )
    logger?.error?.(
      `pickup-fulfillment-cancelled: error for order ${order.id}`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.updated",
  context: {
    subscriberId: "pickup-fulfillment-cancelled-handler",
  },
}
