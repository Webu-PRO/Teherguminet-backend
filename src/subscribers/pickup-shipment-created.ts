import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { FulfillmentWorkflowEvents } from "@medusajs/utils"
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
import { isPickupShippingMethod } from "../lib/own-delivery-shipping"

type ShipmentCreatedEventPayload = {
  id?: string
  no_notification?: boolean
}

const PICKUP_COMPLETED_TEMPLATE = "order-pickup-completed"
const PICKUP_COMPLETED_EMAIL_METADATA_KEY = "pickup_completed_email_sent_at"

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

const resolveShippingMethod = async (
  query: Query,
  order: OrderDTO,
  fulfillment: FulfillmentDTO
): Promise<OrderShippingMethodDTO | null> => {
  const methods = order.shipping_methods ?? []

  const resolveFromShippingOption = async () => {
    const shippingOptionId = fulfillment.shipping_option_id
    if (!shippingOptionId) {
      return null
    }

    try {
      const { data } = await query.graph({
        entity: "shipping_option",
        fields: [
          "id",
          "name",
          "provider_id",
          "data",
          "metadata",
          "type.code",
          "type.label",
          "type.description",
        ],
        filters: {
          id: shippingOptionId,
        },
      })

      const shippingOption = (data?.[0] ?? null) as
        | Record<string, unknown>
        | null
      if (!shippingOption) {
        return null
      }

      return {
        id:
          typeof shippingOption.id === "string"
            ? shippingOption.id
            : shippingOptionId,
        shipping_option_id: shippingOptionId,
        name:
          typeof shippingOption.name === "string"
            ? shippingOption.name
            : undefined,
        provider_id:
          typeof shippingOption.provider_id === "string"
            ? shippingOption.provider_id
            : undefined,
        data:
          shippingOption.data &&
          typeof shippingOption.data === "object" &&
          !Array.isArray(shippingOption.data)
            ? (shippingOption.data as Record<string, unknown>)
            : undefined,
        metadata:
          shippingOption.metadata &&
          typeof shippingOption.metadata === "object" &&
          !Array.isArray(shippingOption.metadata)
            ? (shippingOption.metadata as Record<string, unknown>)
            : undefined,
        type:
          shippingOption.type &&
          typeof shippingOption.type === "object" &&
          !Array.isArray(shippingOption.type)
            ? shippingOption.type
            : undefined,
      } as unknown as OrderShippingMethodDTO
    } catch {
      return null
    }
  }

  if (methods.length && fulfillment.shipping_option_id) {
    const match = methods.find(
      (method) =>
        method.shipping_option_id === fulfillment.shipping_option_id
    )

    if (match) {
      return match
    }
  }

  const shippingOptionMethod = await resolveFromShippingOption()
  if (shippingOptionMethod) {
    return shippingOptionMethod
  }

  if (!methods.length) {
    return null
  }

  const pickupCandidate = methods.find((method) =>
    isPickupShippingMethod(method)
  )
  if (pickupCandidate) {
    return pickupCandidate
  }

  return methods.length === 1 ? methods[0] : methods.at(-1) ?? null
}

export default async function pickupShipmentCreatedHandler({
  event,
  container,
}: SubscriberArgs<ShipmentCreatedEventPayload>) {
  const fulfillmentId = event?.data?.id
  if (!fulfillmentId || event?.data?.no_notification) {
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
  if (metadata[PICKUP_COMPLETED_EMAIL_METADATA_KEY]) {
    return
  }

  const order = fulfillment.order
  const email = order.email?.trim()
  if (!email) {
    return
  }

  const shippingMethod = await resolveShippingMethod(query, order, fulfillment)
  if (!isPickupShippingMethod(shippingMethod)) {
    return
  }

  const notification: CreateNotificationDTO = {
    to: email,
    channel: "email",
    template: PICKUP_COMPLETED_TEMPLATE,
    data: {
      order,
    },
    trigger_type: event.name,
    resource_id: order.id,
    resource_type: "order",
    idempotency_key: `${PICKUP_COMPLETED_TEMPLATE}-${fulfillment.id}`,
  }

  try {
    await dispatchNotificationsIndividually(
      notificationModuleService,
      [notification],
      logger
    )

    await fulfillmentModuleService.updateFulfillment(fulfillment.id, {
      metadata: {
        ...metadata,
        [PICKUP_COMPLETED_EMAIL_METADATA_KEY]: new Date().toISOString(),
      },
    })
  } catch (error) {
    logger?.warn?.(
      `pickup-shipment-created: failed for fulfillment ${fulfillment.id}`
    )
    logger?.error?.(
      `pickup-shipment-created: error for fulfillment ${fulfillment.id}`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: FulfillmentWorkflowEvents.SHIPMENT_CREATED,
  context: {
    subscriberId: "pickup-shipment-created-handler",
  },
}
