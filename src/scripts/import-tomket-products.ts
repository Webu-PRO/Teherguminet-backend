import type { ExecArgs } from "@medusajs/framework/types"

import {
  runTomketImport,
  TomketImportConfigError,
  type TomketImportOptions,
} from "../lib/tomket-import"
import { notifyStorefrontFacetRevalidate } from "../lib/storefront-revalidate"

const readFlag = (args: string[], name: string) =>
  args.includes(`--${name}`)

const readValue = (args: string[], name: string) => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`))
  if (inline) {
    return inline.slice(name.length + 3)
  }

  const index = args.indexOf(`--${name}`)
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1]
  }

  return undefined
}

/**
 * Imports the Tomket dropship catalogue into Medusa.
 *
 *   npx medusa exec ./src/scripts/import-tomket-products.ts -- --dry-run --limit=50
 *   npx medusa exec ./src/scripts/import-tomket-products.ts -- --types=TS,TW,TA
 */
export default async function importTomketProducts({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve("logger")
  const argv = args ?? []

  const limit = Number(readValue(argv, "limit"))
  const batchSize = Number(readValue(argv, "batch-size"))
  const types = (readValue(argv, "types") ?? "")
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean)

  const options: TomketImportOptions = {
    dryRun: readFlag(argv, "dry-run"),
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : undefined,
    types,
    skipOutOfStock: readFlag(argv, "skip-out-of-stock"),
    onProgress: (message) => logger.info(`[tomket] ${message}`),
  }

  try {
    const result = await runTomketImport(container, options)

    logger.info(
      `[tomket] Kész — feed: ${result.feed.rows} sor, feldolgozható: ${result.eligible}, ` +
        `létrehozva: ${result.created}, frissítve: ${result.updated}, hiba: ${result.failed.length}.`
    )

    if (!result.dryRun) {
      await notifyStorefrontFacetRevalidate(logger)
    }

    if (result.dryRun) {
      logger.info("[tomket] Minta az első tételekből:")
      for (const item of result.preview) {
        logger.info(
          `[tomket]   ${item.sku}  ${item.title}  (${item.producer}, ${item.type})  ` +
            `készlet: ${item.stock}  ár: ${item.priceHuf} Ft / ${item.priceEur} EUR  ` +
            `beszerzés: ${item.costEurNet} EUR`
        )
      }
    }

    for (const failure of result.failed.slice(0, 10)) {
      logger.error(`[tomket] ${failure.sku}: ${failure.reason}`)
    }
  } catch (error) {
    if (error instanceof TomketImportConfigError) {
      logger.error(`[tomket] ${error.message}`)
      return
    }
    throw error
  }
}
