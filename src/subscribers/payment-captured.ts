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
  ICustomerModuleService,
  IOrderModuleService,
  Logger,
  OrderDTO,
  OrderShippingMethodDTO,
  Query,
} from "@medusajs/types"

import { isGlsShippingMethod } from "../lib/gls"
import {
  BILLINGO_ERROR_KEYS,
  BILLINGO_METADATA_KEYS,
  BILLINGO_STATUS_KEYS,
  type BillingoDocumentError,
  type BillingoDocumentStatus,
  applyBillingoPartnerMetadata,
  createBillingoPartner,
  createBillingoReceipt,
  getBillingoConfig,
  getBillingoPublicUrl,
  hasBillingoMetadata,
  resolveBillingoPartnerId,
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
      "total",
      "item_total",
      "tax_total",
      "item_tax_total",
      "shipping_total",
      "shipping_subtotal",
      "shipping_tax_total",
      "original_total",
      "original_item_total",
      "original_tax_total",
      "original_shipping_tax_total",
      "summary.*",
      "items.*",
      "items.tax_lines.*",
      "items.variant.id",
      "items.variant.title",
      "items.variant.sku",
      "items.variant.metadata",
      "items.variant.product.id",
      "items.variant.product.title",
      "items.variant.product.handle",
      "items.variant.product.metadata",
      "items.variant.product.tags.*",
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

  let metadataSnapshot: Record<string, unknown> | null = null
  let orderId: string | null = null
  try {
    const order = await fetchOrderForBillingo(container, paymentId)
    if (!order) {
      return
    }
    orderId = order.id

    if (hasBillingoMetadata(order.metadata, "receipt")) {
      return
    }

    const metadata =
      (order.metadata as Record<string, unknown> | null) ?? {}
    metadataSnapshot = metadata
    let partnerId = resolveBillingoPartnerId(metadata)
    let customerMetadata: Record<string, unknown> | null = null
    let customerService: ICustomerModuleService | null = null
    if (!partnerId && order.customer_id) {
      try {
        customerService =
          container.resolve<ICustomerModuleService>(Modules.CUSTOMER)
        const customer = await customerService.retrieveCustomer(
          order.customer_id,
          { select: ["id", "metadata"] }
        )
        customerMetadata =
          (customer.metadata as Record<string, unknown> | null) ?? {}
        partnerId = resolveBillingoPartnerId(customerMetadata)
      } catch {
        logger?.warn?.(
          `Billingo: failed to fetch customer for payment ${paymentId}`
        )
      }
    }

    if (!partnerId) {
      const partner = await createBillingoPartner(order, config)
      partnerId = partner.id
    }

    const mergedMetadata = partnerId
      ? applyBillingoPartnerMetadata(metadata, partnerId)
      : metadata
    metadataSnapshot = mergedMetadata
    const orderForBillingo = partnerId
      ? { ...order, metadata: mergedMetadata }
      : order

    const orderModuleService =
      container.resolve<IOrderModuleService>(Modules.ORDER)
    const statusKey = BILLINGO_STATUS_KEYS.receipt
    const errorKey = BILLINGO_ERROR_KEYS.receipt

    const updateBillingoStatus = async (
      status: BillingoDocumentStatus,
      error?: BillingoDocumentError | null,
      extra?: Record<string, unknown>
    ) => {
      await orderModuleService.updateOrders(order.id, {
        metadata: {
          ...mergedMetadata,
          [statusKey]: status,
          [errorKey]: error ?? null,
          ...(extra ?? {}),
        },
      })
    }

    await updateBillingoStatus("pending")

    const receipt = await createBillingoReceipt(orderForBillingo, config)

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

    const payload: BillingoDocumentMetadata = {
      id: receipt.id,
      invoice_number: receipt.invoice_number,
      public_url: publicUrl,
      created_at: new Date().toISOString(),
    }

    if (partnerId && order.customer_id) {
      try {
        const service =
          customerService ??
          container.resolve<ICustomerModuleService>(Modules.CUSTOMER)
        const metadataForCustomer = customerMetadata ?? {}
        await service.updateCustomers(order.customer_id, {
          metadata: {
            ...metadataForCustomer,
            billingo_partner_id: partnerId,
          },
        })
      } catch {
        logger?.warn?.(
          `Billingo: failed to update customer metadata for payment ${paymentId}`
        )
      }
    }

    await updateBillingoStatus("success", null, {
      [BILLINGO_METADATA_KEYS.receipt]: payload,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error"
    try {
      if (orderId) {
        const orderModuleService =
          container.resolve<IOrderModuleService>(Modules.ORDER)
        await orderModuleService.updateOrders(orderId, {
          metadata: {
            ...(metadataSnapshot ?? {}),
            [BILLINGO_STATUS_KEYS.receipt]: "failed",
            [BILLINGO_ERROR_KEYS.receipt]: {
              message,
              at: new Date().toISOString(),
            },
          },
        })
      }
    } catch {
      // ignore metadata update errors
    }
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
