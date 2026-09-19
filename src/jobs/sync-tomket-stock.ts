import type { MedusaContainer } from "@medusajs/framework/types"

import { resolveTomketConfig } from "../lib/tomket"
import { resolveTomketPricingConfig } from "../lib/tomket-catalog"
import { runTomketStockSync } from "../lib/tomket-import"
import {
  readTomketStatus,
  releaseTomketRun,
  tryAcquireTomketRun,
} from "../lib/tomket-status"

/**
 * Tomket refreshes the stock and price file every ten minutes (API docs 4.2).
 * Running a little slower than that keeps us current without hammering them.
 */
export default async function syncTomketStockJob(container: MedusaContainer) {
  const logger = container.resolve("logger")

  const { missing } = resolveTomketConfig()
  const { missing: missingPricing } = resolveTomketPricingConfig()
  const allMissing = [...missing, ...missingPricing]

  if (allMissing.length) {
    // Not configured yet — stay quiet rather than erroring every 15 minutes.
    logger.debug?.(
      `[tomket] Készlet szinkron kihagyva, hiányzó config: ${allMissing.join(", ")}`
    )
    return
  }

  // Never overlap with a catalogue import (or a still-running earlier sync):
  // both write inventory levels for the same SKUs.
  if (!tryAcquireTomketRun("stock-sync")) {
    logger.info("[tomket] Készlet szinkron kihagyva: import vagy szinkron fut.")
    return
  }

  try {
    const { state } = await readTomketStatus(container)
    if (state === "running") {
      logger.info("[tomket] Készlet szinkron kihagyva: import fut.")
      return
    }

    const result = await runTomketStockSync(container, {
      onProgress: (message) => logger.info(`[tomket] ${message}`),
    })

    logger.info(
      `[tomket] Készlet szinkron: ${result.matched} variáns / ${result.feedRows} feed sor.`
    )
  } catch (error) {
    logger.error(
      `[tomket] Készlet szinkron hiba: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  } finally {
    releaseTomketRun()
  }
}

export const config = {
  name: "sync-tomket-stock",
  schedule: process.env.TOMKET_STOCK_SYNC_CRON || "*/15 * * * *",
}
