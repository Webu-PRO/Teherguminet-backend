import {
  deriveFeedMarketsFromRegions,
  getFeedStatusRegionKeys,
  getLegacyPairToRegionMap,
  isSupportedFeedPair,
  normalizeFeedMarkets,
} from "../feed-markets"

describe("feed market helpers", () => {
  it("derives one feed market per region-country pair", () => {
    const markets = deriveFeedMarketsFromRegions([
      {
        id: "reg_hu",
        name: "Hungary",
        currency_code: "huf",
        countries: [
          { iso_2: "hu", display_name: "Hungary" },
        ],
      },
      {
        id: "reg_sk",
        name: "Slovakia",
        currency_code: "eur",
        countries: [
          { iso_2: "sk", display_name: "Slovakia" },
          { iso_2: "cz", display_name: "Czechia" },
        ],
      },
    ])

    expect(markets.map((entry) => entry.id)).toEqual([
      "reg_sk:cz",
      "reg_hu:hu",
      "reg_sk:sk",
    ])

    expect(markets.map((entry) => entry.legacy_market_key)).toEqual([
      "cz_eur",
      "hu_huf",
      "sk_eur",
    ])
  })

  it("builds region status keys and legacy pair mapping", () => {
    const normalized = normalizeFeedMarkets([
      {
        id: "reg_hu:hu",
        region_id: "reg_hu",
        region_name: "Hungary",
        country_code: "hu",
        country_name: "Hungary",
        currency_code: "huf",
      },
      {
        id: "reg_sk:sk",
        region_id: "reg_sk",
        region_name: "Slovakia",
        country_code: "sk",
        country_name: "Slovakia",
        currency_code: "eur",
      },
      {
        id: "reg_sk:cz",
        region_id: "reg_sk",
        region_name: "Slovakia",
        country_code: "cz",
        country_name: "Czechia",
        currency_code: "eur",
      },
    ])

    expect(getFeedStatusRegionKeys(normalized)).toEqual(["reg_hu", "reg_sk"])
    expect(getLegacyPairToRegionMap(normalized)).toEqual({
      hu_huf: ["reg_hu"],
      sk_eur: ["reg_sk"],
      cz_eur: ["reg_sk"],
    })
  })

  it("checks if a country+currency pair is supported", () => {
    const markets = normalizeFeedMarkets([
      {
        id: "reg_hu:hu",
        region_id: "reg_hu",
        region_name: "Hungary",
        country_code: "hu",
        country_name: "Hungary",
        currency_code: "huf",
      },
    ])

    expect(
      isSupportedFeedPair(markets, {
        country_code: "hu",
        currency_code: "huf",
      })
    ).toBe(true)

    expect(
      isSupportedFeedPair(markets, {
        country_code: "sk",
        currency_code: "eur",
      })
    ).toBe(false)
  })
})
