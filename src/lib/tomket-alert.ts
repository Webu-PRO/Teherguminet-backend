import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { INotificationModuleService, Logger } from "@medusajs/types"

/**
 * E-mail to the shop owner when a paid order's Tomket part was NOT placed
 * with the supplier. Order #97 sat with "error 308" in fulfillment metadata
 * for four days because nothing told anyone. Recipient: TOMKET_ALERT_EMAIL;
 * unset means no alert (logged once per failure).
 */

export const TOMKET_ALERT_EMAIL_ENV = "TOMKET_ALERT_EMAIL"

const ADMIN_ORDER_URL = "https://admin.teherguminet.hu/app/orders"

type ScopedContainer = { resolve: <T = unknown>(key: string) => T }

export type TomketAlertInput = {
  orderId?: string | null
  displayId?: number | string | null
  reason: string
  details?: string[]
}

export const buildTomketFailureAlert = (input: TomketAlertInput) => {
  const ref = input.displayId ? `#${input.displayId}` : input.orderId ?? "?"
  const lines = [
    `A(z) ${ref} rendelés Tomket-tételeit NEM sikerült leadni a Tomketnek.`,
    "",
    `Ok: ${input.reason}`,
    ...(input.details?.length ? ["", ...input.details.map((d) => `- ${d}`)] : []),
    "",
    "Teendő: ellenőrizd a rendelést, és add le kézzel a Tomketnél, vagy javítsd az adatot és szólj a fejlesztőnek.",
    ...(input.orderId ? ["", `${ADMIN_ORDER_URL}/${input.orderId}`] : []),
  ]
  return {
    subject: `Tomket továbbítás sikertelen – ${ref}`,
    text: lines.join("\n"),
  }
}

/** Never throws: an alert failure must not break the order flow. */
export const sendTomketFailureAlert = async (
  container: ScopedContainer,
  input: TomketAlertInput
) => {
  let logger: Logger | undefined
  try {
    logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  } catch {
    logger = undefined
  }

  const to = process.env[TOMKET_ALERT_EMAIL_ENV]?.trim()
  if (!to) {
    logger?.warn?.(
      `[tomket] Riasztás nem ment ki (${TOMKET_ALERT_EMAIL_ENV} nincs beállítva): ${input.reason}`
    )
    return false
  }

  try {
    const notifications = container.resolve<INotificationModuleService>(
      Modules.NOTIFICATION
    )
    await notifications.createNotifications([
      {
        to,
        channel: "email",
        template: "tomket-forward-failed",
        content: buildTomketFailureAlert(input),
        data: { order_id: input.orderId ?? null },
      },
    ])
    return true
  } catch (error) {
    logger?.error?.(
      `[tomket] Riasztás küldése sikertelen: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return false
  }
}
