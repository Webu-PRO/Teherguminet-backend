import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type {
  ICustomerModuleService,
  IOrderModuleService,
  Logger,
  OrderDTO,
  Query,
} from "@medusajs/types"

import { sendOrderConfirmationWorkflow } from "../workflows/send-order-confirmation"
import {
  applyBillingoPartnerMetadata,
  BILLINGO_ERROR_KEYS,
  createBillingoPartner,
  createBillingoInvoice,
  getBillingoConfig,
  getBillingoPublicUrl,
  BILLINGO_METADATA_KEYS,
  BILLINGO_STATUS_KEYS,
  hasBillingoMetadata,
  resolveBillingoPartnerId,
  type BillingoDocumentError,
  type BillingoDocumentStatus,
  type BillingoDocumentMetadata,
} from "../lib/billingo"

const resolveLogger = (container: SubscriberArgs["container"]) => {
  try {
    return container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  } catch {
    return undefined
  }
}

const normalizeThumbnail = (value?: string | null) => {
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const resolveImageUrl = (value: unknown) => {
  if (typeof value === "string") {
    return normalizeThumbnail(value)
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return (
      normalizeThumbnail(record.url as string | null) ??
      normalizeThumbnail(record.src as string | null)
    )
  }

  return undefined
}

const resolveItemThumbnail = (item: Record<string, unknown>) => {
  const existing = normalizeThumbnail(item.thumbnail as string | null)
  if (existing) {
    return undefined
  }

  const variant = item.variant as Record<string, unknown> | null
  const product =
    (variant?.product as Record<string, unknown> | null) ?? null

  const candidates: Array<unknown> = [
    product?.thumbnail,
    variant?.thumbnail,
    ...(Array.isArray(product?.images)
      ? (product?.images as Array<unknown>)
      : []),
  ]

  for (const candidate of candidates) {
    const url = resolveImageUrl(candidate)
    if (url) {
      return url
    }
  }

  return undefined
}

const fetchOrderForBillingo = async (
  container: SubscriberArgs["container"],
  orderId: string
) => {
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
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

const maybeCreateBillingoInvoice = async (
  container: SubscriberArgs["container"],
  orderId: string,
  logger?: Logger
) => {
  const config = getBillingoConfig()
  if (!config?.invoiceBlockId) {
    return
  }

  let metadataSnapshot: Record<string, unknown> | null = null
  try {
    const order = await fetchOrderForBillingo(container, orderId)
    if (!order) {
      return
    }

    if (hasBillingoMetadata(order.metadata, "invoice")) {
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
          `Billingo: failed to fetch customer for order ${orderId}`
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
    const statusKey = BILLINGO_STATUS_KEYS.invoice
    const errorKey = BILLINGO_ERROR_KEYS.invoice

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

    const invoice = await createBillingoInvoice(orderForBillingo, config)

    let publicUrl: string | undefined
    if (typeof invoice?.id === "number") {
      try {
        const publicData = await getBillingoPublicUrl(invoice.id, config)
        publicUrl =
          typeof publicData?.public_url === "string"
            ? publicData.public_url
            : undefined
      } catch (error) {
        logger?.warn?.(
          `Billingo: failed to fetch public url for invoice ${invoice.id}`
        )
      }
    }

    const payload: BillingoDocumentMetadata = {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
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
          `Billingo: failed to update customer metadata for order ${orderId}`
        )
      }
    }

    await updateBillingoStatus("success", null, {
      [BILLINGO_METADATA_KEYS.invoice]: payload,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error"
    try {
      const orderModuleService =
        container.resolve<IOrderModuleService>(Modules.ORDER)
      await orderModuleService.updateOrders(orderId, {
        metadata: {
          ...(metadataSnapshot ?? {}),
          [BILLINGO_STATUS_KEYS.invoice]: "failed",
          [BILLINGO_ERROR_KEYS.invoice]: {
            message,
            at: new Date().toISOString(),
          },
        },
      })
    } catch {
      // ignore metadata update errors
    }
    logger?.error?.(
      `Billingo: failed to create invoice for order ${orderId} (${message})`
    )
  }
}

const updateOrderItemThumbnails = async (
  container: SubscriberArgs["container"],
  orderId: string,
  logger?: Logger
) => {
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const orderModuleService =
    container.resolve<IOrderModuleService>(Modules.ORDER)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "items.id",
      "items.thumbnail",
      "items.variant.thumbnail",
      "items.variant.product.thumbnail",
      "items.variant.product.images.*",
    ],
    filters: {
      id: orderId,
    },
  })

  const order = orders?.[0] as OrderDTO | undefined
  if (!order?.items?.length) {
    return
  }

  const updates = order.items
    .map((item) => {
      const record = item as unknown as Record<string, unknown>
      const thumbnail = resolveItemThumbnail(record)
      if (!thumbnail || !record.id) {
        return null
      }

      return {
        selector: { id: String(record.id) },
        data: { thumbnail },
      }
    })
    .filter(
      (
        entry
      ): entry is {
        selector: { id: string }
        data: { thumbnail: string }
      } => Boolean(entry)
    )

  if (!updates.length) {
    return
  }

  try {
    await orderModuleService.updateOrderLineItems(updates)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error"
    logger?.warn?.(
      `Order thumbnails: failed to update line items (${message})`
    )
  }
}

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = resolveLogger(container)
  await maybeCreateBillingoInvoice(container, data.id, logger)
  await sendOrderConfirmationWorkflow(container).run({
    input: {
      id: data.id,
    },
  })

  await updateOrderItemThumbnails(container, data.id, logger)
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
