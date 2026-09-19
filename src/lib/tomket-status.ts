import { Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/types"

import type { TomketImportResult } from "./tomket-import"

export const TOMKET_STATUS_METADATA_KEY = "tomket_import"

/**
 * In-process guard so an import and the scheduled stock sync never run at the
 * same time. The persisted status alone is not enough: two admin requests can
 * both read "idle" before either has written "running". The flag is taken
 * synchronously, before the first await, so the check-and-set cannot interleave.
 */
let runInFlight: TomketRunStatus["mode"] | null = null

export const tryAcquireTomketRun = (mode: TomketRunStatus["mode"]) => {
  if (runInFlight) {
    return false
  }
  runInFlight = mode
  return true
}

export const releaseTomketRun = () => {
  runInFlight = null
}

export const tomketRunInFlight = () => runInFlight

/**
 * A persisted "running" outlives a crash or a redeploy mid-import. Nothing
 * legitimately runs this long, so past this age the status is an orphan and
 * must not block the next run.
 */
export const TOMKET_RUN_STALE_MS = 2 * 60 * 60 * 1000

export const isTomketRunActive = (
  status: Pick<TomketRunStatus, "state" | "startedAt">,
  now = Date.now()
) => {
  if (status.state !== "running") {
    return false
  }
  const startedAt = status.startedAt ? Date.parse(status.startedAt) : NaN
  return Number.isFinite(startedAt) && now - startedAt < TOMKET_RUN_STALE_MS
}

export type TomketRunState = "idle" | "running" | "done" | "error"

export type TomketRunStatus = {
  state: TomketRunState
  mode: "import" | "dry-run" | "stock-sync"
  startedAt: string | null
  finishedAt: string | null
  message: string | null
  log: string[]
  result: TomketImportResult | null
  error: string | null
}

export const EMPTY_STATUS: TomketRunStatus = {
  state: "idle",
  mode: "import",
  startedAt: null,
  finishedAt: null,
  message: null,
  log: [],
  result: null,
  error: null,
}

const MAX_LOG_LINES = 40

const resolveStoreService = (container: MedusaContainer) =>
  container.resolve(Modules.STORE)

const resolvePrimaryStore = async (container: MedusaContainer) => {
  const stores = await resolveStoreService(container).listStores()
  return stores[0] ?? null
}

/**
 * Store metadata is read-modify-write, and the import route fires progress
 * writes without awaiting them. Two writes in flight at once lose the earlier
 * one — observed as a finished import stuck on "running" because the last
 * progress write landed after the "done" write. Every write therefore goes
 * through this FIFO queue, so completion order equals call order.
 */
let metadataQueue: Promise<unknown> = Promise.resolve()

const enqueueStoreMetadataWrite = <T>(task: () => Promise<T>): Promise<T> => {
  // `metadataQueue` always resolves (see the catch below), so the rejection
  // handler never fires; it is there so a write still runs even if the tail
  // ever rejects. Do not drop the catch: a failed write must not block the
  // next one.
  const run = metadataQueue.then(task, task)
  metadataQueue = run.catch(() => undefined)
  return run
}

/** One key of the primary store's metadata — the Tomket state lives there. */
export const readStoreMetadata = async (
  container: MedusaContainer,
  key: string
): Promise<unknown> => {
  const store = await resolvePrimaryStore(container)
  return (store?.metadata as Record<string, unknown> | undefined)?.[key]
}

export const writeStoreMetadata = (
  container: MedusaContainer,
  key: string,
  value: unknown
) =>
  enqueueStoreMetadataWrite(async () => {
    const store = await resolvePrimaryStore(container)
    if (!store?.id) {
      return
    }

    await resolveStoreService(container).updateStores(store.id, {
      metadata: {
        ...((store.metadata as Record<string, unknown> | undefined) ?? {}),
        [key]: value,
      },
    })
  })

export const readTomketStatus = async (
  container: MedusaContainer
): Promise<TomketRunStatus> => {
  const store = await resolvePrimaryStore(container)
  const stored = (store?.metadata as Record<string, unknown> | undefined)?.[
    TOMKET_STATUS_METADATA_KEY
  ]

  if (!stored || typeof stored !== "object") {
    return EMPTY_STATUS
  }

  return { ...EMPTY_STATUS, ...(stored as Partial<TomketRunStatus>) }
}

export const writeTomketStatus = (
  container: MedusaContainer,
  status: TomketRunStatus
) =>
  writeStoreMetadata(container, TOMKET_STATUS_METADATA_KEY, {
    ...status,
    log: status.log.slice(-MAX_LOG_LINES),
  })
