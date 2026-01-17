import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
import { PaymentEvents } from "@medusajs/utils"
import type { Logger, OrderShippingMethodDTO, Query } from "@medusajs/types"

import { isGlsShippingMethod } from "../lib/gls"
import { sendPaymentReceiptWorkflow } from "../workflows/send-payment-receipt"

type PaymentOrder = {
  id: string
  fulfillment_status?: string | null
  fulfillments?: Array<{ id?: string | null } | null> | null
  items?: Array<{
    id?: string | null
    quantity?: number | null
    requires_shipping?: boolean | null
  } | null>
  shipping_methods?: OrderShippingMethodDTO[] | null
}

type PaymentRecord = {
  payment_collection?: {
    order?: PaymentOrder | null
  } | null
}

const resolveLogger = (container: SubscriberArgs["container"]) => {
  try {
    return container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  } catch {
    return undefined
  }
}

const shouldSkipFulfillment = (order?: PaymentOrder | null) => {
  if (!order) {
    return true
  }

  if (
    order.fulfillment_status &&
    order.fulfillment_status !== "not_fulfilled"
  ) {
    return true
  }

  return Boolean(
    order.fulfillments?.some((fulfillment) => fulfillment?.id)
  )
}

const resolveFulfillmentItems = (items?: PaymentOrder["items"]) => {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .filter(
      (
        item
      ): item is {
        id: string
        quantity?: number | null
        requires_shipping?: boolean | null
      } => Boolean(item?.id)
    )
    .filter((item) => item.requires_shipping !== false)
    .map((item) => ({
      id: item.id,
      quantity:
        typeof item.quantity === "number" && item.quantity > 0
          ? item.quantity
          : 0,
    }))
    .filter((item) => item.quantity > 0)
}

const maybeCreateGlsFulfillment = async (
  container: SubscriberArgs["container"],
  paymentId: string
) => {
  const logger = resolveLogger(container)
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)

  try {
    const { data: payments } = await query.graph({
      entity: "payment",
      fields: [
        "id",
        "payment_collection.order.id",
        "payment_collection.order.fulfillment_status",
        "payment_collection.order.fulfillments.id",
        "payment_collection.order.items.id",
        "payment_collection.order.items.quantity",
        "payment_collection.order.items.requires_shipping",
        "payment_collection.order.shipping_methods.*",
      ],
      filters: {
        id: paymentId,
      },
    })

    const payment = payments?.[0] as PaymentRecord | undefined
    const order = payment?.payment_collection?.order

    if (!order?.id) {
      return
    }

    const shippingMethods = (order.shipping_methods ?? []).filter(
      Boolean
    ) as OrderShippingMethodDTO[]
    const isGlsOrder = shippingMethods.some(isGlsShippingMethod)

    if (!isGlsOrder) {
      return
    }

    if (shouldSkipFulfillment(order)) {
      return
    }

    const itemsToFulfill = resolveFulfillmentItems(order.items)
    if (!itemsToFulfill.length) {
      return
    }

    await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: order.id,
        items: itemsToFulfill,
      },
    })
  } catch (error) {
    logger?.warn?.(
      `payment-captured: failed to auto-create GLS fulfillment for payment ${paymentId}`
    )
    logger?.error?.(
      `payment-captured: error auto-creating GLS fulfillment for payment ${paymentId}`,
      error as Error
    )
  }
}

export default async function paymentCapturedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (!data?.id) {
    return
  }

  await maybeCreateGlsFulfillment(container, data.id)

  await sendPaymentReceiptWorkflow(container).run({
    input: {
      paymentId: data.id,
    },
  })
}

export const config: SubscriberConfig = {
  event: PaymentEvents.CAPTURED,
}
