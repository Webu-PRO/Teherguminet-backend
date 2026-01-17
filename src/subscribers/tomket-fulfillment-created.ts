import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type {
  FulfillmentDTO,
  IFulfillmentModuleService,
  Logger,
  OrderDTO,
  OrderShippingMethodDTO,
  Query,
} from "@medusajs/types"

import {
  buildTomketOrderId,
  buildTomketOrderPayload,
  createTomketOrder,
  isTomketShippingMethod,
  isTomketShippingOption,
  resolveTomketConfig,
  resolveTomketItems,
  resolveTomketRecipient,
} from "../lib/tomket"

type FulfillmentEventPayload = {
  id: string
}

const TOMKET_FULFILLMENT_METADATA_KEY = "tomket_orders"

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

const extractMetadata = (
  fulfillment: FulfillmentDTO
): Record<string, unknown> => {
  return (fulfillment.metadata as Record<string, unknown>) ?? {}
}

const normalizeMetadataString = (
  value: unknown,
  maxLength = 255
) => {
  if (typeof value !== "string") {
    return undefined
  }

  const normalized = value
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/[;\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!normalized) {
    return undefined
  }

  if (normalized.length > maxLength) {
    return normalized.slice(0, maxLength).trim()
  }

  return normalized
}

export default async function tomketFulfillmentCreated({
  event: { data },
  container,
}: SubscriberArgs<FulfillmentEventPayload>) {
  const logger = resolveLogger(container)
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const fulfillmentModuleService =
    container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT)

  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    fields: [
      "id",
      "provider_id",
      "shipping_option_id",
      "metadata",
      "data",
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
      "order.metadata",
      "order.shipping_address.*",
      "order.billing_address.*",
      "order.items.*",
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
      `Tomket: fulfillment ${data.id} missing order relation`
    )
    return
  }

  const order = fulfillment.order
  const shippingMethod = resolveShippingMethod(order, fulfillment)
  const matchesTomket =
    fulfillment.provider_id === "tomket" ||
    isTomketShippingOption(fulfillment.shipping_option) ||
    isTomketShippingMethod(shippingMethod)
  if (!matchesTomket) {
    return
  }

  const metadata = extractMetadata(fulfillment)
  if (metadata[TOMKET_FULFILLMENT_METADATA_KEY]) {
    return
  }

  const { config, missing } = resolveTomketConfig()
  if (!config) {
    logger?.warn?.(
      `Tomket: missing config (${missing.join(", ")})`
    )
    return
  }

  const { recipient, missing: missingRecipient } =
    resolveTomketRecipient(fulfillment, order)
  if (!recipient) {
    logger?.warn?.(
      `Tomket: missing recipient fields (${missingRecipient.join(
        ", "
      )}) for fulfillment ${fulfillment.id}`
    )
    return
  }

  const { items, missing: missingItems } = resolveTomketItems(
    order.items
  )
  if (!items.length) {
    logger?.warn?.(
      `Tomket: no items to fulfill for order ${order.id}`
    )
    return
  }

  if (missingItems.length) {
    logger?.warn?.(
      `Tomket: missing internal tire id for items (${missingItems.join(
        ", "
      )}) in order ${order.id}`
    )
    return
  }

  const note = normalizeMetadataString(
    metadata.tomket_note ?? order.metadata?.tomket_note
  )
  const shipdate = normalizeMetadataString(
    metadata.tomket_shipdate ?? order.metadata?.tomket_shipdate,
    10
  )

  const orders: Array<Record<string, unknown>> = []
  let hadErrors = false

  for (const item of items) {
    const orderId = buildTomketOrderId(order, item)
    const payload = buildTomketOrderPayload({
      item,
      recipient,
      orderId,
      note: note ?? undefined,
      shipdate: shipdate ?? undefined,
    })

    try {
      const result = await createTomketOrder(payload, config)
      orders.push({
        order_id: orderId,
        internal_id: item.internalId,
        quantity: item.quantity,
        line_item_ids: item.lineItemIds,
        source: item.source,
        request: result.request,
        response: result.response,
      })
    } catch (error) {
      hadErrors = true
      orders.push({
        order_id: orderId,
        internal_id: item.internalId,
        quantity: item.quantity,
        line_item_ids: item.lineItemIds,
        source: item.source,
        request: payload,
        error:
          error instanceof Error ? error.message : String(error),
      })
      logger?.error?.(
        `Tomket: failed to create order ${orderId} for fulfillment ${fulfillment.id}`,
        error as Error
      )
    }
  }

  if (orders.length) {
    await fulfillmentModuleService.updateFulfillment(fulfillment.id, {
      metadata: {
        ...metadata,
        [TOMKET_FULFILLMENT_METADATA_KEY]: {
          created_at: new Date().toISOString(),
          has_errors: hadErrors,
          orders,
        },
      },
    })
  }
}

export const config: SubscriberConfig = {
  event: "order.fulfillment_created",
}
