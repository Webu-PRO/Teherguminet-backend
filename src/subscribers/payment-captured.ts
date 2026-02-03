import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
import { PaymentEvents } from "@medusajs/utils"
import type {
  IOrderModuleService,
  Logger,
  OrderDTO,
  OrderShippingMethodDTO,
  Query,
} from "@medusajs/types"

import { isGlsShippingMethod } from "../lib/gls"
import {
  BILLINGO_METADATA_KEYS,
  createBillingoReceipt,
  getBillingoConfig,
  getBillingoPublicUrl,
  hasBillingoMetadata,
  type BillingoDocumentMetadata,
} from "../lib/billingo"
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

const fetchOrderForBillingo = async (
  container: SubscriberArgs["container"],
  paymentId: string
) => {
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data: payments } = await query.graph({
    entity: "payment",
    fields: ["id", "payment_collection.order.id"],
    filters: {
      id: paymentId,
    },
  })

  const payment = payments?.[0] as PaymentRecord | undefined
  const orderId = payment?.payment_collection?.order?.id
  if (!orderId) {
    return undefined
  }

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "created_at",
      "currency_code",
      "metadata",
      "shipping_total",
      "items.*",
      "items.tax_lines.*",
      "shipping_methods.*",
      "shipping_methods.tax_lines.*",
      "billing_address.*",
      "shipping_address.*",
    ],
    filters: {
      id: orderId,
    },
  })

  return orders?.[0] as OrderDTO | undefined
}

const maybeCreateBillingoReceipt = async (
  container: SubscriberArgs["container"],
  paymentId: string,
  logger?: Logger
) => {
  const config = getBillingoConfig()
  if (!config) {
    return
  }

  try {
    const order = await fetchOrderForBillingo(container, paymentId)
    if (!order) {
      return
    }

    if (hasBillingoMetadata(order.metadata, "receipt")) {
      return
    }

    const receipt = await createBillingoReceipt(order, config)

    let publicUrl: string | undefined
    if (typeof receipt?.id === "number") {
      try {
        const publicData = await getBillingoPublicUrl(receipt.id, config)
        publicUrl =
          typeof publicData?.public_url === "string"
            ? publicData.public_url
            : undefined
      } catch (error) {
        logger?.warn?.(
          `Billingo: failed to fetch public url for receipt ${receipt.id}`
        )
      }
    }

    const orderModuleService =
      container.resolve<IOrderModuleService>(Modules.ORDER)
    const metadata =
      (order.metadata as Record<string, unknown> | null) ?? {}
    const payload: BillingoDocumentMetadata = {
      id: receipt.id,
      invoice_number: receipt.invoice_number,
      public_url: publicUrl,
      created_at: new Date().toISOString(),
    }

    await orderModuleService.updateOrders(order.id, {
      metadata: {
        ...metadata,
        [BILLINGO_METADATA_KEYS.receipt]: payload,
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error"
    logger?.error?.(
      `Billingo: failed to create receipt for payment ${paymentId} (${message})`
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
  await maybeCreateBillingoReceipt(container, data.id, resolveLogger(container))

  await sendPaymentReceiptWorkflow(container).run({
    input: {
      paymentId: data.id,
    },
  })
}

export const config: SubscriberConfig = {
  event: PaymentEvents.CAPTURED,
}
