import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type {
  IOrderModuleService,
  Logger,
  OrderDTO,
  Query,
} from "@medusajs/types"

import { sendOrderConfirmationWorkflow } from "../workflows/send-order-confirmation"

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
      const record = item as Record<string, unknown>
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
