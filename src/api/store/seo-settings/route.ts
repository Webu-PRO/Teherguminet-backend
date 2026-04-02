import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IStoreModuleService } from "@medusajs/types"
import { Modules } from "@medusajs/utils"

import {
  SEO_SETTINGS_METADATA_KEY,
  normalizeSeoSettings,
} from "../../../lib/seo-settings"

const resolvePrimaryStore = async (req: MedusaRequest) => {
  const storeService = req.scope.resolve<IStoreModuleService>(Modules.STORE)
  const stores = await storeService.listStores()

  return stores[0] ?? null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const store = await resolvePrimaryStore(req)
  const storedSettings = store?.metadata
    ? (store.metadata as Record<string, unknown>)[SEO_SETTINGS_METADATA_KEY]
    : null

  res.status(200).json({
    ok: true,
    settings: normalizeSeoSettings(storedSettings),
  })
}
