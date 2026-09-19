import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
import type { MedusaContainer, OrderLineItemDTO } from "@medusajs/types"

import { resolveTomketItems } from "./tomket"
import { readTomketSettings, resolveTomketSettings } from "./tomket-settings"
import { ensureTomketShippingOption } from "./tomket-shipping"

/**
 * Hands the Tomket part of a paid order to the supplier without an operator
 * click: it creates a fulfillment with the admin-only "Tomket dropship"
 * shipping option for the Tomket line items, and the existing
 * `tomket-fulfillment-created` subscriber places the order on the Tomket API.
 *
 * "Paid" means at least one captured payment on the order. Card payments are
 * captured right after checkout; bank transfer / cash on delivery orders wait
 * until the operator marks the payment captured in the admin. Nothing is
 * ordered from the supplier for an unpaid order.
 */

export const TOMKET_AUTO_FORWARD_METADATA_KEY = "tomket_auto_forward"

export type ForwardableOrder = {
  id: string
  display_id?: number | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  items?: OrderLineItemDTO[] | null
  fulfillments?: Array<{
    id: string
    provider_id?: string | null
    canceled_at?: string | Date | null
    items?: Array<{ line_item_id?: string | null; quantity?: unknown }> | null
  }> | null
  payment_collections?: Array<{
    status?: string | null
    payments?: Array<{
      captured_at?: string | Date | null
      canceled_at?: string | Date | null
    }> | null
  }> | null
}

export type ForwardPlan =
  | { action: "skip"; reason: string }
  | {
      action: "fulfill"
      items: Array<{ id: string; quantity: number }>
      internalIds: string[]
    }

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const isOrderPaid = (order: ForwardableOrder) =>
  (order.payment_collections ?? []).some((collection) =>
    (collection.payments ?? []).some(
      (payment) => Boolean(payment.captured_at) && !payment.canceled_at
    )
  )

/** Pure decision: what to fulfil for this order, or why not. */
export const planTomketForward = (order: ForwardableOrder): ForwardPlan => {
  if (order.status === "canceled") {
    return { action: "skip", reason: "a rendelés törölve" }
  }

  const { items: tomketItems } = resolveTomketItems(
    (order.items ?? []) as Parameters<typeof resolveTomketItems>[0]
  )
  if (!tomketItems.length) {
    return { action: "skip", reason: "nincs Tomket tétel" }
  }

  if (!isOrderPaid(order)) {
    return { action: "skip", reason: "még nincs befizetés" }
  }

  // Quantities already covered by any live fulfillment (Tomket or not) are
  // not sent again, so an operator who fulfilled part of the order by hand
  // is never double-ordered.
  const fulfilled = new Map<string, number>()
  for (const fulfillment of order.fulfillments ?? []) {
    if (fulfillment.canceled_at) {
      continue
    }
    for (const item of fulfillment.items ?? []) {
      if (!item.line_item_id) {
        continue
      }
      fulfilled.set(
        item.line_item_id,
        (fulfilled.get(item.line_item_id) ?? 0) + toNumber(item.quantity)
      )
    }
  }

  const byLineItem = new Map(
    (order.items ?? []).map((item) => [item.id, toNumber(item.quantity)])
  )
  const tomketLineItemIds = new Set(
    tomketItems.flatMap((item) => item.lineItemIds)
  )

  const items: Array<{ id: string; quantity: number }> = []
  for (const lineItemId of tomketLineItemIds) {
    const remaining =
      (byLineItem.get(lineItemId) ?? 0) - (fulfilled.get(lineItemId) ?? 0)
    if (remaining > 0) {
      items.push({ id: lineItemId, quantity: remaining })
    }
  }

  if (!items.length) {
    return { action: "skip", reason: "minden Tomket tétel már teljesítés alatt" }
  }

  return {
    action: "fulfill",
    items,
    internalIds: tomketItems.map((item) => item.internalId),
  }
}

const ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "metadata",
  "items.*",
  "items.variant.id",
  "items.variant.sku",
  "items.variant.metadata",
  "fulfillments.id",
  "fulfillments.provider_id",
  "fulfillments.canceled_at",
  "fulfillments.items.line_item_id",
  "fulfillments.items.quantity",
  "payment_collections.status",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.canceled_at",
]

// One order at a time: order.placed and payment.captured can arrive within
// the same second for a card payment.
const inFlight = new Set<string>()

export type AutoForwardResult =
  | { outcome: "skipped"; reason: string }
  | { outcome: "fulfilled"; fulfillmentId: string; items: number }

export const autoForwardTomketOrder = async (
  container: MedusaContainer,
  orderId: string
): Promise<AutoForwardResult> => {
  const settings = resolveTomketSettings(await readTomketSettings(container))
  if (!settings.autoForwardPaidOrders.value) {
    return { outcome: "skipped", reason: "automatikus továbbítás kikapcsolva" }
  }

  if (inFlight.has(orderId)) {
    return { outcome: "skipped", reason: "már folyamatban" }
  }
  inFlight.add(orderId)

  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "order",
      fields: ORDER_FIELDS,
      filters: { id: orderId },
    })
    const order = (data?.[0] ?? null) as ForwardableOrder | null
    if (!order) {
      return { outcome: "skipped", reason: "a rendelés nem található" }
    }

    const plan = planTomketForward(order)
    if (plan.action === "skip") {
      return { outcome: "skipped", reason: plan.reason }
    }

    const { option } = await ensureTomketShippingOption(container)

    const { result } = await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: order.id,
        items: plan.items,
        shipping_option_id: option.id,
        requires_shipping: true,
        no_notification: false,
        metadata: {
          [TOMKET_AUTO_FORWARD_METADATA_KEY]: {
            at: new Date().toISOString(),
            internal_ids: plan.internalIds,
          },
        },
      },
    })

    const orderService = container.resolve(Modules.ORDER)
    await orderService.updateOrders(order.id, {
      metadata: {
        ...(order.metadata ?? {}),
        [TOMKET_AUTO_FORWARD_METADATA_KEY]: {
          state: "fulfillment_created",
          fulfillment_id: result.id,
          items: plan.items.length,
          at: new Date().toISOString(),
        },
      },
    })

    return {
      outcome: "fulfilled",
      fulfillmentId: result.id,
      items: plan.items.length,
    }
  } finally {
    inFlight.delete(orderId)
  }
}
