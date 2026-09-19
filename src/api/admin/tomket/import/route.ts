import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import {
  runTomketImport,
  TomketImportConfigError,
} from "../../../../lib/tomket-import"
import {
  readTomketStatus,
  writeTomketStatus,
  type TomketRunStatus,
} from "../../../../lib/tomket-status"

type ImportBody = {
  dry_run?: boolean
  limit?: number
  types?: string[]
  skip_out_of_stock?: boolean
  batch_size?: number
}

export async function POST(
  req: MedusaRequest<ImportBody>,
  res: MedusaResponse
) {
  const body = (req.body ?? {}) as ImportBody
  const logger = req.scope.resolve("logger")

  const current = await readTomketStatus(req.scope)
  if (current.state === "running") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Már fut egy Tomket import. Várd meg, amíg befejeződik."
    )
  }

  const dryRun = Boolean(body.dry_run)
  const log: string[] = []

  const status: TomketRunStatus = {
    state: "running",
    mode: dryRun ? "dry-run" : "import",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: "Feed letöltése…",
    log,
    result: null,
    error: null,
  }

  await writeTomketStatus(req.scope, status)

  // A full catalogue import runs far longer than an HTTP request should, so it
  // continues in the background and the admin polls GET /admin/tomket.
  void (async () => {
    try {
      const result = await runTomketImport(req.scope, {
        dryRun,
        limit: body.limit,
        types: body.types,
        skipOutOfStock: body.skip_out_of_stock,
        batchSize: body.batch_size,
        onProgress: (message) => {
          log.push(`${new Date().toISOString()} ${message}`)
          status.message = message
          logger.info(`[tomket] ${message}`)
          void writeTomketStatus(req.scope, status)
        },
      })

      await writeTomketStatus(req.scope, {
        ...status,
        state: "done",
        finishedAt: new Date().toISOString(),
        message: dryRun
          ? `Száraz futtatás kész: ${result.eligible} termék jönne létre/frissülne.`
          : `Kész: ${result.created} létrehozva, ${result.updated} frissítve.`,
        log,
        result,
      })
    } catch (error) {
      const message =
        error instanceof TomketImportConfigError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error)

      logger.error(`[tomket] Import hiba: ${message}`)

      await writeTomketStatus(req.scope, {
        ...status,
        state: "error",
        finishedAt: new Date().toISOString(),
        message: null,
        log,
        error: message,
      })
    }
  })()

  res.status(202).json({ ok: true, status })
}
