import {
  FEED_STATUS_METADATA_KEY,
  buildFeedStatusContext,
  getDefaultFeedChannelStatusByMarket,
  normalizeFeedChannelStatusByMarket,
  setFeedChannelActiveForMarket,
  upsertFeedStatusInStoreMetadata,
} from "../feed-status"

const markets = [
  {
    id: "reg_hu:hu",
    region_id: "reg_hu",
    region_name: "Hungary",
    country_code: "hu",
    country_name: "Hungary",
    currency_code: "huf",
    flag: "🇭🇺",
    label: "HU / HUF",
    legacy_market_key: "hu_huf",
  },
  {
    id: "reg_sk:sk",
    region_id: "reg_sk",
    region_name: "Slovakia",
    country_code: "sk",
    country_name: "Slovakia",
    currency_code: "eur",
    flag: "🇸🇰",
    label: "SK / EUR",
    legacy_market_key: "sk_eur",
  },
  {
    id: "reg_sk:cz",
    region_id: "reg_sk",
    region_name: "Slovakia",
    country_code: "cz",
    country_name: "Czechia",
    currency_code: "eur",
    flag: "🇨🇿",
    label: "CZ / EUR",
    legacy_market_key: "cz_eur",
  },
]

describe("feed status helpers", () => {
  it("returns defaults when input is missing or malformed", () => {
    const context = buildFeedStatusContext(markets)

    expect(normalizeFeedChannelStatusByMarket(null, context)).toEqual(
      getDefaultFeedChannelStatusByMarket(context.marketKeys)
    )

    expect(normalizeFeedChannelStatusByMarket("invalid", context)).toEqual(
      getDefaultFeedChannelStatusByMarket(context.marketKeys)
    )
  })

  it("normalizes strict true values and migrates legacy pair keys", () => {
    const context = buildFeedStatusContext(markets)

    expect(
      normalizeFeedChannelStatusByMarket(
        {
          reg_hu: {
            facebook: true,
            google: "true",
          },
          hu_huf: {
            google: true,
          },
          sk_eur: {
            facebook: true,
          },
        },
        context
      )
    ).toEqual({
      reg_hu: {
        facebook: true,
        google: true,
      },
      reg_sk: {
        facebook: true,
        google: false,
      },
    })
  })

  it("updates one channel without losing other regions and merges metadata", () => {
    const context = buildFeedStatusContext(markets)

    const current = {
      reg_hu: {
        facebook: true,
        google: false,
      },
      reg_sk: {
        facebook: false,
        google: false,
      },
    }

    const nextStatus = setFeedChannelActiveForMarket({
      current,
      market: "reg_sk",
      channel: "google",
      active: true,
      context,
    })

    expect(nextStatus).toEqual({
      reg_hu: {
        facebook: true,
        google: false,
      },
      reg_sk: {
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
        reg_hu: {
          facebook: true,
          google: false,
        },
        reg_sk: {
          facebook: false,
          google: true,
        },
      },
    })
  })
})
