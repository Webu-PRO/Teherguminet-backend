import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PaymentEvents } from "@medusajs/utils"

import { autoForwardTomketOrder } from "../lib/tomket-auto-forward"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A payment is linked to its order a moment after the capture event; poll a
 * few times before giving up, like payment-captured.ts does.
 */
const resolveOrderIdFromPayment = async (
  container: SubscriberArgs["container"],
  paymentId: string
) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  let delay = 500

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data } = await query.graph({
      entity: "payment",
      fields: ["id", "payment_collection.order.id"],
      filters: { id: paymentId },
    })
    const orderId = (
      data?.[0] as { payment_collection?: { order?: { id?: string } } } | undefined
    )?.payment_collection?.order?.id
    if (orderId) {
      return orderId
    }
    await sleep(delay)
    delay += 500
  }

  return null
}

/**
 * Forwards the Tomket items of a paid order to the supplier. Runs on
 * order.placed (card payments are already captured by then) and on
 * payment.captured (bank transfer / cash on delivery, captured later by the
 * operator). Both are idempotent: quantities already fulfilled are skipped.
 */
export default async function tomketAutoForward({
  event: { name, data },
  container,
}: SubscriberArgs<{ id?: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const id = data?.id
  if (!id) {
    return
  }

  const orderId =
    name === "order.placed"
      ? id
      : await resolveOrderIdFromPayment(container, id)
  if (!orderId) {
    return
  }

  try {
    const result = await autoForwardTomketOrder(container, orderId)
    if (result.outcome === "fulfilled") {
      logger.info(
        `[tomket] Rendelés ${orderId}: ${result.items} Tomket tétel továbbítva (fulfillment ${result.fulfillmentId}).`
      )
    } else {
      logger.debug?.(
        `[tomket] Rendelés ${orderId}: nincs továbbítás (${result.reason}).`
      )
    }
  } catch (error) {
    logger.error(
      `[tomket] Rendelés ${orderId}: automatikus továbbítás hiba: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: ["order.placed", PaymentEvents.CAPTURED],
}
