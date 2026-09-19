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

export const writeTomketStatus = async (
  container: MedusaContainer,
  status: TomketRunStatus
) => {
  const store = await resolvePrimaryStore(container)
  if (!store?.id) {
    return
  }

  await resolveStoreService(container).updateStores(store.id, {
    metadata: {
      ...((store.metadata as Record<string, unknown> | undefined) ?? {}),
      [TOMKET_STATUS_METADATA_KEY]: {
        ...status,
        log: status.log.slice(-MAX_LOG_LINES),
      },
    },
  })
}
