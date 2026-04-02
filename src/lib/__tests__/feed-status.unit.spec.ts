import {
  FEED_STATUS_METADATA_KEY,
  getDefaultFeedChannelStatusByMarket,
  normalizeFeedChannelStatusByMarket,
  setFeedChannelActiveForMarket,
  upsertFeedStatusInStoreMetadata,
} from "../feed-status"

describe("feed status helpers", () => {
  it("returns defaults when input is missing or malformed", () => {
    expect(normalizeFeedChannelStatusByMarket(null)).toEqual(
      getDefaultFeedChannelStatusByMarket()
    )

    expect(normalizeFeedChannelStatusByMarket("invalid")).toEqual(
      getDefaultFeedChannelStatusByMarket()
    )
  })

  it("normalizes only strict true values", () => {
    expect(
      normalizeFeedChannelStatusByMarket({
        hu_huf: {
          facebook: true,
          google: "true",
        },
        sk_eur: {
          facebook: false,
          google: true,
        },
      })
    ).toEqual({
      hu_huf: {
        facebook: true,
        google: false,
      },
      sk_eur: {
        facebook: false,
        google: true,
      },
    })
  })

  it("updates one channel without losing other markets and merges metadata", () => {
    const current = {
      hu_huf: {
        facebook: true,
        google: false,
      },
      sk_eur: {
        facebook: false,
        google: false,
      },
    }

    const nextStatus = setFeedChannelActiveForMarket({
      current,
      market: "sk_eur",
      channel: "google",
      active: true,
    })

    expect(nextStatus).toEqual({
      hu_huf: {
        facebook: true,
        google: false,
      },
      sk_eur: {
        facebook: false,
        google: true,
      },
    })

    const mergedMetadata = upsertFeedStatusInStoreMetadata(
      {
        existing_key: "kept",
      },
      nextStatus
    )

    expect(mergedMetadata).toEqual({
      existing_key: "kept",
      [FEED_STATUS_METADATA_KEY]: {
        hu_huf: {
          facebook: true,
          google: false,
        },
        sk_eur: {
          facebook: false,
          google: true,
        },
      },
    })
  })
})
