import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import {
  runTomketImport,
  TomketImportConfigError,
} from "../../../../lib/tomket-import"
import {
  readTomketStatus,
  releaseTomketRun,
  tryAcquireTomketRun,
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
  const dryRun = Boolean(body.dry_run)

  // Synchronous check-and-set: no await between the check and the claim, so
  // two concurrent POSTs cannot both pass. The persisted status below is the
  // display copy and also covers a run started before a restart.
  if (!tryAcquireTomketRun(dryRun ? "dry-run" : "import")) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Már fut egy Tomket import vagy készlet-szinkron. Várd meg, amíg befejeződik."
    )
  }

  let current: Awaited<ReturnType<typeof readTomketStatus>>
  try {
    current = await readTomketStatus(req.scope)
  } catch (error) {
    releaseTomketRun()
    throw error
  }

  if (current.state === "running") {
    releaseTomketRun()
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Már fut egy Tomket import. Várd meg, amíg befejeződik."
    )
  }

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

  try {
    await writeTomketStatus(req.scope, status)
  } catch (error) {
    releaseTomketRun()
    throw error
  }

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
          writeTomketStatus(req.scope, status).catch((error) => {
            logger.warn(
              `[tomket] Állapot mentése nem sikerült: ${
                error instanceof Error ? error.message : String(error)
              }`
            )
          })
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
    } finally {
      releaseTomketRun()
    }
  })()

  res.status(202).json({ ok: true, status })
}
