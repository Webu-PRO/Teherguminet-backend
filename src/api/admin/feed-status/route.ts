import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateStoresWorkflow } from "@medusajs/medusa/core-flows"
import type { IStoreModuleService } from "@medusajs/types"
import { Modules } from "@medusajs/utils"

import type { AdminUpdateFeedStatusType } from "./middlewares"
import { listFeedMarketsFromRegions } from "../../../lib/feed-markets-loader"
import {
  FEED_STATUS_METADATA_KEY,
  buildFeedStatusContext,
  normalizeFeedChannelStatusByMarket,
  setFeedChannelActiveForMarket,
  upsertFeedStatusInStoreMetadata,
} from "../../../lib/feed-status"

const resolvePrimaryStore = async (req: MedusaRequest) => {
  const storeService = req.scope.resolve<IStoreModuleService>(Modules.STORE)
  const stores = await storeService.listStores()

  return stores[0] ?? null
}

const buildPayload = (
  store: { id?: string; metadata?: unknown } | null,
  markets: Awaited<ReturnType<typeof listFeedMarketsFromRegions>>
) => {
  const statusContext = buildFeedStatusContext(markets)
  const storedStatus = store?.metadata
    ? (store.metadata as Record<string, unknown>)[FEED_STATUS_METADATA_KEY]
    : null

  return {
    ok: true,
    store_id: store?.id ?? null,
    markets,
    status: normalizeFeedChannelStatusByMarket(storedStatus, statusContext),
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const [store, markets] = await Promise.all([
    resolvePrimaryStore(req),
    listFeedMarketsFromRegions(req.scope),
  ])

  res.status(200).json(buildPayload(store, markets))
}

export async function PATCH(
  req: MedusaRequest<AdminUpdateFeedStatusType>,
  res: MedusaResponse
) {
  const store = await resolvePrimaryStore(req)

  if (!store?.id) {
    res.status(404).json({
      message: "Store not found.",
    })
    return
  }

  const markets = await listFeedMarketsFromRegions(req.scope)
  const statusContext = buildFeedStatusContext(markets)

  if (!statusContext.marketKeys.includes(req.validatedBody.market)) {
    res.status(400).json({
      message: `Unknown feed market '${req.validatedBody.market}'.`,
    })
    return
  }

  const existingMetadata =
    store.metadata && typeof store.metadata === "object"
      ? (store.metadata as Record<string, unknown>)
      : {}

  const nextStatus = setFeedChannelActiveForMarket({
    current: existingMetadata[FEED_STATUS_METADATA_KEY],
    market: req.validatedBody.market,
    channel: req.validatedBody.channel,
    active: req.validatedBody.active,
    context: statusContext,
  })

  const nextMetadata = upsertFeedStatusInStoreMetadata(existingMetadata, nextStatus)

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
    markets,
    status: nextStatus,
  })
}
