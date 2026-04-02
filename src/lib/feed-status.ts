export const FEED_STATUS_METADATA_KEY = "feed_channel_status"

export const FEED_STATUS_MARKETS = ["hu_huf", "sk_eur"] as const
export const FEED_STATUS_CHANNELS = ["facebook", "google"] as const

export type FeedStatusMarket = (typeof FEED_STATUS_MARKETS)[number]
export type FeedStatusChannel = (typeof FEED_STATUS_CHANNELS)[number]

export type FeedChannelStatusByMarket = Record<
  FeedStatusMarket,
  Record<FeedStatusChannel, boolean>
>

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

export const getDefaultFeedChannelStatusByMarket = (): FeedChannelStatusByMarket => {
  return {
    hu_huf: {
      facebook: false,
      google: false,
    },
    sk_eur: {
      facebook: false,
      google: false,
    },
  }
}

export const normalizeFeedChannelStatusByMarket = (
  value: unknown
): FeedChannelStatusByMarket => {
  const raw = toRecord(value)
  const next = getDefaultFeedChannelStatusByMarket()

  for (const market of FEED_STATUS_MARKETS) {
    const marketRecord = toRecord(raw[market])

    for (const channel of FEED_STATUS_CHANNELS) {
      next[market][channel] = marketRecord[channel] === true
    }
  }

  return next
}

export const setFeedChannelActiveForMarket = (input: {
  current: unknown
  market: FeedStatusMarket
  channel: FeedStatusChannel
  active: boolean
}): FeedChannelStatusByMarket => {
  const normalized = normalizeFeedChannelStatusByMarket(input.current)

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

