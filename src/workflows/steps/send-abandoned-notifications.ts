import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import type {
  CartDTO,
  CustomerDTO,
} from "@medusajs/framework/types"

type AbandonedCart = CartDTO & {
  customer: CustomerDTO | null
}

type SendAbandonedNotificationsInput = {
  carts: AbandonedCart[]
}

const buildCartHtml = (
  cart: AbandonedCart,
  storefrontUrl: string
): string => {
  const itemsHtml =
    cart.items?.length
      ? cart.items
          .map((item) => {
            const price = (item.unit_price ?? 0) / 100
            return `
            <tr>
              <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">
                <strong>${item.title}</strong><br/>
                <small>Qty: ${item.quantity}</small>
              </td>
              <td style="padding: 8px 12px; text-align:right; border-bottom: 1px solid #eee;">
                ${price.toLocaleString("hu-HU", {
                  style: "currency",
                  currency: cart.region?.currency_code?.toUpperCase() ?? "HUF",
                })}
              </td>
            </tr>`
          })
          .join("")
      : ""

  const recoverUrl = new URL(
    `/cart/recover/${cart.id}`,
    storefrontUrl
  ).toString()

  const firstName =
    cart.customer?.first_name ??
    cart.shipping_address?.first_name ??
    "Kedves vásárló"

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Szia ${firstName}! A kosarad még vár rád 🛒</h2>
      <p>Úgy tűnik, néhány termék maradt a kosaradban. Egyetlen kattintással befejezheted a rendelést.</p>
      <table style="width:100%; border-collapse: collapse; margin-top:16px;">
        ${itemsHtml}
      </table>
      <div style="text-align:center; margin: 24px 0;">
        <a href="${recoverUrl}"
           style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
          Tovább a kosárhoz
        </a>
      </div>
      <p style="font-size:12px;color:#6b7280;">Ha közben segítségre lenne szükséged, írj nekünk a <a href="mailto:info@therguminet.hu">info@therguminet.hu</a> címen.</p>
    </div>
  `
}

export const sendAbandonedNotificationsStep = createStep(
  "send-abandoned-notifications",
  async (
    input: SendAbandonedNotificationsInput,
    { container }
  ) => {
    if (!input.carts?.length) {
      return new StepResponse({ notifications: [] })
    }

    const storefrontUrl =
      process.env.STOREFRONT_URL?.trim() ||
      "https://therguminet.hu"

    const notificationModuleService = container.resolve(
      Modules.NOTIFICATION
    )

    const notificationsPayload =
      input.carts.map((cart) => ({
        to: cart.email!,
        channel: "email",
        template: "hostinger-smpt-template",
        content: {
          subject:
            "Emlékeztető: a kosarad még vár rád!",
          html: buildCartHtml(cart, storefrontUrl),
          text: `Szia ${
            cart.customer?.first_name ??
            cart.shipping_address?.first_name ??
            ""
          }! A kosarad még vár rád: ${new URL(
            `/cart/recover/${cart.id}`,
            storefrontUrl
          ).toString()}`,
        },
        data: {
          cart_id: cart.id,
        },
      }))

    const notifications =
      await notificationModuleService.createNotifications(
        notificationsPayload
      )

    return new StepResponse({
      notifications,
    })
  }
)
