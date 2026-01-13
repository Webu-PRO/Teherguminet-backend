import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { FulfillmentEvents } from "@medusajs/utils"
import type {
  CreateNotificationDTO,
  FulfillmentDTO,
  IFulfillmentModuleService,
  INotificationModuleService,
  Logger,
  OrderDTO,
  OrderShippingMethodDTO,
  Query,
} from "@medusajs/types"

import { dispatchNotificationsIndividually } from "../lib/dispatch-notifications"

type FulfillmentEventPayload = {
  id: string
}

const DELIVERY_EMAIL_METADATA_KEY = "delivery_email_sent_at"

const resolveLogger = (container: SubscriberArgs["container"]) => {
  try {
    return container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  } catch {
    return undefined
  }
}

const resolveMetadata = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
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

export default async function fulfillmentDeliveredHandler({
  event,
  container,
}: SubscriberArgs<FulfillmentEventPayload>) {
  const fulfillmentId = event?.data?.id

  if (!fulfillmentId) {
    return
  }

  const logger = resolveLogger(container)
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const notificationModuleService =
    container.resolve<INotificationModuleService>(Modules.NOTIFICATION)
  const fulfillmentModuleService =
    container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT)

  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    fields: [
      "id",
      "delivered_at",
      "tracking_numbers",
      "metadata",
      "shipping_option_id",
      "shipping_option.name",
      "order.id",
      "order.display_id",
      "order.email",
      "order.currency_code",
      "order.metadata",
      "order.total",
      "order.subtotal",
      "order.shipping_total",
      "order.item_total",
      "order.items.*",
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
    | (FulfillmentDTO & {
        order?: OrderDTO
        shipping_option?: { name?: string | null } | null
      })
    | undefined

  if (!fulfillment || !fulfillment.order) {
    return
  }

  if (!fulfillment.delivered_at) {
    return
  }

  const metadata = resolveMetadata(fulfillment.metadata)
  if (metadata[DELIVERY_EMAIL_METADATA_KEY]) {
    return
  }

  const order = fulfillment.order
  if (!order.email) {
    return
  }

  const shippingMethod = resolveShippingMethod(order, fulfillment)
  const shippingOptionName =
    fulfillment.shipping_option?.name?.trim() ||
    shippingMethod?.name?.trim() ||
    null

  const trackingNumbers =
    "tracking_numbers" in fulfillment
      ? ((fulfillment as { tracking_numbers?: unknown }).tracking_numbers as
          | Array<string | null | undefined>
          | null
          | undefined)
      : undefined

  const payload: CreateNotificationDTO = {
    to: order.email,
    channel: "email",
    template: "order-delivered",
    data: {
      order,
      fulfillment: {
        delivered_at: fulfillment.delivered_at,
        shipping_option_name: shippingOptionName,
        tracking_numbers: trackingNumbers ?? [],
      },
    },
    trigger_type: event.name,
    resource_id: order.id,
    resource_type: "order",
    idempotency_key: `order-delivered-${fulfillment.id}`,
  }

  try {
    await dispatchNotificationsIndividually(
      notificationModuleService,
      [payload],
      logger
    )

    await fulfillmentModuleService.updateFulfillment(fulfillment.id, {
      metadata: {
        ...metadata,
        [DELIVERY_EMAIL_METADATA_KEY]: new Date().toISOString(),
      },
    })
  } catch (error) {
    logger?.warn?.(
      `fulfillment-delivered: failed to send delivery email for ${fulfillment.id}`
    )
    logger?.error?.(
      `fulfillment-delivered: error sending delivery email for ${fulfillment.id}`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: FulfillmentEvents.FULFILLMENT_UPDATED,
  context: {
    subscriberId: "fulfillment-delivered-handler",
  },
}
