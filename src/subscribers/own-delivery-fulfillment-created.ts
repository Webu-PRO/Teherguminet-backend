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
  Logger,
  OrderDTO,
  OrderShippingMethodDTO,
  Query,
} from "@medusajs/types"

import { dispatchNotificationsIndividually } from "../lib/dispatch-notifications"
import { isOwnDeliveryShippingMethod } from "../lib/own-delivery-shipping"

type FulfillmentCreatedEventPayload = {
  id?: string
  no_notification?: boolean
}

const OWN_DELIVERY_FULFILLMENT_CREATED_TEMPLATE =
  "own-delivery-fulfillment-created"
const OWN_DELIVERY_FULFILLMENT_CREATED_EMAIL_METADATA_KEY =
  "own_delivery_fulfillment_created_email_sent_at"

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

export default async function ownDeliveryFulfillmentCreatedHandler({
  event,
  container,
}: SubscriberArgs<FulfillmentCreatedEventPayload>) {
  const fulfillmentId = event?.data?.id
  if (!fulfillmentId) {
    return
  }

  if (event?.data?.no_notification) {
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
      "metadata",
      "shipping_option_id",
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

  const fulfillment = fulfillments?.[0] as unknown as
    | (FulfillmentDTO & { order?: OrderDTO })
    | undefined

  if (!fulfillment || !fulfillment.order) {
    return
  }

  const metadata = resolveMetadata(fulfillment.metadata)
  if (metadata[OWN_DELIVERY_FULFILLMENT_CREATED_EMAIL_METADATA_KEY]) {
    return
  }

  const order = fulfillment.order
  const email = order.email?.trim()
  if (!email) {
    return
  }

  const shippingMethod = resolveShippingMethod(order, fulfillment)
  if (!isOwnDeliveryShippingMethod(shippingMethod)) {
    return
  }

  const payload: CreateNotificationDTO = {
    to: email,
    channel: "email",
    template: OWN_DELIVERY_FULFILLMENT_CREATED_TEMPLATE,
    data: {
      order,
    },
    trigger_type: event.name,
    resource_id: order.id,
    resource_type: "order",
    idempotency_key: `${OWN_DELIVERY_FULFILLMENT_CREATED_TEMPLATE}-${fulfillment.id}`,
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
        [OWN_DELIVERY_FULFILLMENT_CREATED_EMAIL_METADATA_KEY]:
          new Date().toISOString(),
      },
    })
  } catch (error) {
    logger?.warn?.(
      `own-delivery-fulfillment-created: failed for fulfillment ${fulfillment.id}`
    )
    logger?.error?.(
      `own-delivery-fulfillment-created: error for fulfillment ${fulfillment.id}`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: ["order.fulfillment_created", "fulfillment.created"],
  context: {
    subscriberId: "own-delivery-fulfillment-created-handler",
  },
}
