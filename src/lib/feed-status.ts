import {
  getLegacyPairToRegionMap,
  getFeedStatusRegionKeys,
  type FeedMarket,
} from "./feed-markets"

export const FEED_STATUS_METADATA_KEY = "feed_channel_status"

export const FEED_STATUS_CHANNELS = ["facebook", "google"] as const

export type FeedStatusMarket = string
export type FeedStatusChannel = (typeof FEED_STATUS_CHANNELS)[number]

export type FeedChannelStatusByMarket = Record<
  FeedStatusMarket,
  Record<FeedStatusChannel, boolean>
>

export type FeedStatusContext = {
  marketKeys: FeedStatusMarket[]
  legacyPairToMarketKeys: Record<string, FeedStatusMarket[]>
}

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

const buildEmptyChannelStatus = (): Record<FeedStatusChannel, boolean> => {
  return {
    facebook: false,
    google: false,
  }
}

export const buildFeedStatusContext = (
  markets: Pick<FeedMarket, "region_id" | "legacy_market_key">[]
): FeedStatusContext => {
  return {
    marketKeys: getFeedStatusRegionKeys(markets),
    legacyPairToMarketKeys: getLegacyPairToRegionMap(markets),
  }
}

export const getDefaultFeedChannelStatusByMarket = (
  marketKeys: FeedStatusMarket[]
): FeedChannelStatusByMarket => {
  const next: FeedChannelStatusByMarket = {}

  for (const marketKey of marketKeys) {
    next[marketKey] = buildEmptyChannelStatus()
  }

  return next
}

const applyRawStatusForMarket = (
  target: FeedChannelStatusByMarket,
  rawMarketRecord: Record<string, unknown>,
  marketKey: FeedStatusMarket
) => {
  if (!target[marketKey]) {
    target[marketKey] = buildEmptyChannelStatus()
  }

  for (const channel of FEED_STATUS_CHANNELS) {
    if (rawMarketRecord[channel] === true) {
      target[marketKey][channel] = true
    }
  }
}

export const normalizeFeedChannelStatusByMarket = (
  value: unknown,
  context: FeedStatusContext
): FeedChannelStatusByMarket => {
  const raw = toRecord(value)
  const next = getDefaultFeedChannelStatusByMarket(context.marketKeys)

  for (const marketKey of context.marketKeys) {
    const marketRecord = toRecord(raw[marketKey])
    applyRawStatusForMarket(next, marketRecord, marketKey)
  }

  for (const [legacyPairKey, mappedMarketKeys] of Object.entries(
    context.legacyPairToMarketKeys
  )) {
    const legacyRecord = toRecord(raw[legacyPairKey])

    for (const marketKey of mappedMarketKeys) {
      applyRawStatusForMarket(next, legacyRecord, marketKey)
    }
  }

  return next
}

export const setFeedChannelActiveForMarket = (input: {
  current: unknown
  market: FeedStatusMarket
  channel: FeedStatusChannel
  active: boolean
  context: FeedStatusContext
}): FeedChannelStatusByMarket => {
  const marketKeys = input.context.marketKeys.includes(input.market)
    ? input.context.marketKeys
    : [...input.context.marketKeys, input.market]

  const normalized = normalizeFeedChannelStatusByMarket(input.current, {
    ...input.context,
    marketKeys,
  })

  return {
    ...normalized,
    [input.market]: {
      ...normalized[input.market],
      [input.channel]: input.active,
    },
  }
}

export const upsertFeedStatusInStoreMetadata = (
  metadata: unknown,
  feedStatus: FeedChannelStatusByMarket
): Record<string, unknown> => {
  const metadataRecord = toRecord(metadata)

  return {
    ...metadataRecord,
    [FEED_STATUS_METADATA_KEY]: feedStatus,
  }
}
