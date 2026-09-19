import { afterEach, beforeEach, describe, expect, it } from "@jest/globals"

import { parseTomketFullFeed, type TomketTireRow } from "../tomket-feed"
import {
  buildTomketSize,
  buildTomketTitle,
  calculateTomketPrices,
  mapTomketRowsToDrafts,
  parseTomketSku,
  resolveTomketPricingConfig,
  type TomketPricingConfig,
} from "../tomket-catalog"

const SAMPLE_ROW =
  "128432;6959956703913;Linglong;GREEN-Max Winter HP;165;70;14;T;81;6.767;" +
  "f/c/2/71;26.7;200;7.9;https://img.tomket.com/a.jpg;PW;2617-3417;no;no;no;" +
  "d/a/b/71/1/0;123456;https://eprel.ec.europa.eu/qr/1094564"

const row = (overrides: Partial<TomketTireRow> = {}): TomketTireRow => ({
  ...parseTomketFullFeed(SAMPLE_ROW).rows[0],
  ...overrides,
})

const PRICING: TomketPricingConfig = {
  eurHufRate: 400,
  marginPercentHuf: 25,
  marginPercentEur: 25,
  includeShipping: false,
  hufRounding: 10,
}

describe("resolveTomketPricingConfig", () => {
  const original = { ...process.env }

  beforeEach(() => {
    delete process.env.TOMKET_EUR_HUF_RATE
    delete process.env.TOMKET_MARGIN_PERCENT
    delete process.env.TOMKET_MARGIN_PERCENT_EUR
    delete process.env.TOMKET_INCLUDE_SHIPPING_IN_PRICE
    delete process.env.TOMKET_HUF_ROUNDING
  })

  afterEach(() => {
    process.env = { ...original }
  })

  it("refuses to fall back to the supplier cost price", () => {
    const { config, missing } = resolveTomketPricingConfig()

    expect(config).toBeUndefined()
    expect(missing).toEqual(["TOMKET_EUR_HUF_RATE", "TOMKET_MARGIN_PERCENT"])
  })

  it("accepts a zero markup only when it is set explicitly", () => {
    process.env.TOMKET_EUR_HUF_RATE = "395"
    process.env.TOMKET_MARGIN_PERCENT = "0"

    const { config, missing } = resolveTomketPricingConfig()

    expect(missing).toHaveLength(0)
    expect(config).toMatchObject({ eurHufRate: 395, marginPercentHuf: 0 })
  })

  it("defaults the EUR markup to the HUF markup and rounding to 10 Ft", () => {
    process.env.TOMKET_EUR_HUF_RATE = "400"
    process.env.TOMKET_MARGIN_PERCENT = "22"

    const { config } = resolveTomketPricingConfig()

    expect(config).toMatchObject({
      marginPercentEur: 22,
      hufRounding: 10,
      includeShipping: false,
    })
  })
})

describe("calculateTomketPrices", () => {
  it("applies the markup and FX rate to the net supplier price", () => {
    const prices = calculateTomketPrices(
      { priceEurNet: 26.7, shippingFeeEurNet: 7.9 },
      PRICING
    )

    // 26.7 * 1.25 = 33.375 EUR -> 13350 HUF at 400, rounded to 10 Ft.
    expect(prices.eur).toBe(33.38)
    expect(prices.huf).toBe(13350)
    expect(prices.costEurNet).toBe(26.7)
  })

  it("folds the per-piece shipping fee in when configured", () => {
    const prices = calculateTomketPrices(
      { priceEurNet: 26.7, shippingFeeEurNet: 7.9 },
      { ...PRICING, includeShipping: true }
    )

    // (26.7 + 7.9) * 1.25 = 43.25 EUR -> 17300 HUF.
    expect(prices.eur).toBe(43.25)
    expect(prices.huf).toBe(17300)
  })
})

describe("title and size building", () => {
  it("builds the size and title in the existing catalogue style", () => {
    expect(buildTomketSize(row())).toBe("165/70R14")
    expect(buildTomketTitle(row())).toBe("165/70R14 81T GREEN-Max Winter HP")
  })

  it("omits the aspect ratio when the feed has none", () => {
    expect(buildTomketSize(row({ height: "" }))).toBe("165R14")
  })
})

describe("parseTomketSku", () => {
  it("round-trips a Tomket sku and rejects foreign ones", () => {
    expect(parseTomketSku("TOMKET-128432")).toBe("128432")
    expect(parseTomketSku("T0001")).toBeNull()
    expect(parseTomketSku("TOMKET-abc")).toBeNull()
    expect(parseTomketSku(null)).toBeNull()
  })
})

describe("mapTomketRowsToDrafts", () => {
  it("produces a stable sku, handle and brand taxonomy", () => {
    const { drafts } = mapTomketRowsToDrafts([row()], PRICING)

    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      sku: "TOMKET-128432",
      handle: "165-70r14-81t-green-max-winter-hp-linglong",
      producer: "Linglong",
      producerHandle: "linglong",
      weightGrams: 6767,
    })
    expect(drafts[0].tags).toEqual([
      "Linglong",
      "személy",
      "téli",
      "tomket-dropship",
    ])
  })

  it("carries the internal id into variant metadata for order forwarding", () => {
    const { drafts } = mapTomketRowsToDrafts([row()], PRICING)

    expect(drafts[0].variantMetadata.tomket_internal_id).toBe("128432")
  })

  it("disambiguates identical handles with the Tomket id", () => {
    const { drafts } = mapTomketRowsToDrafts(
      [row({ internalId: "2" }), row({ internalId: "1" })],
      PRICING
    )

    // Sorted by numeric id, so id 1 keeps the clean handle.
    expect(drafts.map((draft) => draft.handle)).toEqual([
      "165-70r14-81t-green-max-winter-hp-linglong",
      "165-70r14-81t-green-max-winter-hp-linglong-2",
    ])
  })

  it("skips rows with no usable size", () => {
    const { drafts, skipped } = mapTomketRowsToDrafts(
      [row({ width: "", diameter: "" })],
      PRICING
    )

    expect(drafts).toHaveLength(0)
    expect(skipped[0]).toMatchObject({ reason: "incomplete size information" })
  })
})
