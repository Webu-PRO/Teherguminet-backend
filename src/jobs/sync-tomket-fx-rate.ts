import type { MedusaContainer } from "@medusajs/framework/types"

import { refreshTomketFxRate } from "../lib/tomket-fx"

/**
 * Daily EUR→HUF refresh from the ECB reference feed. The ECB publishes around
 * 16:00 CET on business days, so 16:30 UTC picks up the same day's rate; the
 * stock sync that follows re-prices the Tomket catalogue with it.
 */
export default async function syncTomketFxRateJob(container: MedusaContainer) {
  const logger = container.resolve("logger")

  if ((process.env.TOMKET_EUR_HUF_RATE ?? "").trim()) {
    // Manual override in place — nothing to refresh.
    return
  }

  try {
    const fx = await refreshTomketFxRate(container)
    logger.info(
      `[tomket] ECB árfolyam frissítve: ${fx.rate} Ft/EUR (${fx.date}).`
    )
  } catch (error) {
    logger.error(
      `[tomket] ECB árfolyam frissítés hiba: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

export const config = {
  name: "sync-tomket-fx-rate",
  schedule: process.env.TOMKET_FX_SYNC_CRON || "30 16 * * *",
}
