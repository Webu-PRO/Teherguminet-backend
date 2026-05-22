import type { MedusaContainer } from "@medusajs/framework/types"
import {
  sendAbandonedCartsWorkflow,
  type SendAbandonedCartsWorkflowInput,
} from "../workflows/send-abandoned-carts"

// 3 hours is the published sweet spot for cart-abandonment recovery emails —
// long enough that the user isn't actively shopping, short enough that intent
// is still warm. Override via ABANDONED_CART_THRESHOLD_MINUTES env var.
const DEFAULT_THRESHOLD_MINUTES = 60 * 3

export default async function abandonedCartJob(
  container: MedusaContainer
) {
  const logger = container.resolve("logger")
  const query = container.resolve("query")

  const thresholdMinutes =
    Number(process.env.ABANDONED_CART_THRESHOLD_MINUTES) ||
    DEFAULT_THRESHOLD_MINUTES

  const thresholdDate = new Date(
    Date.now() - thresholdMinutes * 60 * 1000
  )

  let offset = 0
  const limit = 50
  let total = 0
  let processed = 0

  do {
    const { data: carts, metadata } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "email",
        "metadata",
        "items.id",
        "items.title",
        "items.quantity",
        "items.unit_price",
        "items.thumbnail",
        "customer.id",
        "customer.email",
        "customer.first_name",
        "customer.last_name",
        "shipping_address.first_name",
        "shipping_address.last_name",
        "shipping_address.country_code",
        "billing_address.country_code",
        "region.currency_code",
      ],
      filters: {
        updated_at: {
          $lt: thresholdDate,
        },
        email: {
          $ne: null,
        },
        completed_at: null,
      },
      pagination: {
        skip: offset,
        take: limit,
      },
    })

    total = metadata?.count ?? carts.length

    if (!carts.length) {
      break
    }

    const cartsWithItems = carts.filter(
      (cart: any) =>
        cart.items?.length &&
        !cart.metadata?.abandoned_notification
    )

    if (cartsWithItems.length) {
      try {
        await sendAbandonedCartsWorkflow(container).run({
          input: {
            carts:
              cartsWithItems as unknown as SendAbandonedCartsWorkflowInput["carts"],
          },
        })
        processed += cartsWithItems.length
      } catch (error) {
        logger.error(
          `Failed to send abandoned cart notifications: ${
            error instanceof Error ? error.message : error
          }`
        )
      }
    }

    offset += limit
  } while (offset < total)

  logger.info(
    `Abandoned cart job completed. Notifications sent: ${processed}`
  )
}

export const config = {
  name: "abandoned-cart-notification",
  // Every 2 hours — keeps recovery emails landing within ~5h of abandonment
  // (3h threshold + up to 2h job lag). Override via ABANDONED_CART_SCHEDULE
  // only requires a code change; this constant is read at boot.
  schedule: "0 */2 * * *",
}
