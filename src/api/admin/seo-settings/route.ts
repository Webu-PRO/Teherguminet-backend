import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateStoresWorkflow } from "@medusajs/medusa/core-flows"
import type { IStoreModuleService } from "@medusajs/types"
import { Modules } from "@medusajs/utils"

import type { AdminUpdateSeoSettingsType } from "./middlewares"
import {
  SEO_SETTINGS_METADATA_KEY,
  normalizeSeoSettings,
  upsertSeoSettingsInStoreMetadata,
} from "../../../lib/seo-settings"

const resolvePrimaryStore = async (req: MedusaRequest) => {
  const storeService = req.scope.resolve<IStoreModuleService>(Modules.STORE)
  const stores = await storeService.listStores()

  return stores[0] ?? null
}

const buildPayload = (store: { id?: string; metadata?: unknown } | null) => {
  const storedSettings = store?.metadata
    ? (store.metadata as Record<string, unknown>)[SEO_SETTINGS_METADATA_KEY]
    : null

  return {
    ok: true,
    store_id: store?.id ?? null,
    settings: normalizeSeoSettings(storedSettings),
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const store = await resolvePrimaryStore(req)
  res.status(200).json(buildPayload(store))
}

export async function PATCH(
  req: MedusaRequest<AdminUpdateSeoSettingsType>,
  res: MedusaResponse
) {
  const store = await resolvePrimaryStore(req)

  if (!store?.id) {
    res.status(404).json({
      message: "Store not found.",
    })
    return
  }

  const existingMetadata =
    store.metadata && typeof store.metadata === "object"
      ? (store.metadata as Record<string, unknown>)
      : {}

  const currentSettings = normalizeSeoSettings(
    existingMetadata[SEO_SETTINGS_METADATA_KEY]
  )
  const nextSettings = normalizeSeoSettings({
    ...currentSettings,
    ...req.validatedBody,
  })
  const nextMetadata = upsertSeoSettingsInStoreMetadata(
    existingMetadata,
    nextSettings
  )

  await updateStoresWorkflow(req.scope).run({
    input: {
      selector: { id: store.id },
      update: {
        metadata: nextMetadata,
      },
    },
  })

  res.status(200).json({
    ok: true,
    store_id: store.id,
    settings: nextSettings,
  })
}
