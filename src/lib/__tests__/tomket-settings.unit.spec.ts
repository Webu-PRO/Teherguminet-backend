import {
  parseTomketSettingsInput,
  resolveTomketSettings,
  EMPTY_TOMKET_SETTINGS,
  TomketSettingsValidationError,
} from "../tomket-settings"
import {
  buildTomketDescription,
  buildTomketSeo,
  buildTomketTypeCategory,
  resolveTomketPricingConfig,
} from "../tomket-catalog"
import type { TomketTireRow } from "../tomket-feed"

const ROW: TomketTireRow = {
  internalId: "35273",
  ean: "4024063580473",
  producer: "Barum",
  design: "Brillantis 2",
  width: "155",
  height: "70",
  diameter: "13",
  speedIndex: "T",
  loadIndex: "75",
  weightKg: 5.092,
  priceEurNet: 39.1,
  stock: 1,
  shippingFeeEurNet: 6,
  imageUrl: "https://img.tomket.com/img/ex/pneudetail/barum_brillantis_2.jpg",
  tireType: "PS",
  extraLoad: false,
  runflat: false,
  rimFringeProtector: false,
  label: {
    rollingResistance: "e",
    wetGrip: "c",
    noiseClass: "2",
    noiseValue: "70",
    snowGrip: false,
    iceGrip: false,
  },
}

describe("parseTomketSettingsInput", () => {
  it("treats empty fields as 'use the env default'", () => {
    expect(
      parseTomketSettingsInput({
        marginPercentHuf: "25",
        marginPercentEur: "",
        eurHufMarkupPercent: null,
        hufRounding: 100,
        includeShipping: "true",
      })
    ).toEqual({
      marginPercentHuf: 25,
      marginPercentEur: null,
      eurHufMarkupPercent: null,
      hufRounding: 100,
      includeShipping: true,
      autoForwardPaidOrders: null,
      shippingPriceHuf: null,
      shippingPriceEur: null,
    })
  })

  it("rejects out-of-range and non-numeric values", () => {
    expect(() => parseTomketSettingsInput({ marginPercentHuf: "abc" })).toThrow(
      TomketSettingsValidationError
    )
    expect(() => parseTomketSettingsInput({ hufRounding: 0 })).toThrow(
      TomketSettingsValidationError
    )
    expect(() => parseTomketSettingsInput({ eurHufMarkupPercent: 99 })).toThrow(
      TomketSettingsValidationError
    )
  })
})

describe("resolveTomketSettings", () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env = { ...env }
    delete process.env.TOMKET_MARGIN_PERCENT
    delete process.env.TOMKET_MARGIN_PERCENT_EUR
    delete process.env.TOMKET_EUR_HUF_MARKUP_PERCENT
    delete process.env.TOMKET_HUF_ROUNDING
    delete process.env.TOMKET_INCLUDE_SHIPPING_IN_PRICE
  })
  afterAll(() => {
    process.env = env
  })

  it("prefers the admin value over the env value", () => {
    process.env.TOMKET_MARGIN_PERCENT = "20"
    const resolved = resolveTomketSettings({
      ...EMPTY_TOMKET_SETTINGS,
      marginPercentHuf: 30,
    })
    expect(resolved.marginPercentHuf).toEqual({ value: 30, source: "admin" })
    expect(resolved.marginPercentEur).toEqual({ value: 30, source: "inherited" })
    expect(resolved.hufRounding).toEqual({ value: 10, source: "default" })
  })

  it("falls back to env, then reports the margin as missing", () => {
    process.env.TOMKET_MARGIN_PERCENT = "20"
    expect(resolveTomketSettings(EMPTY_TOMKET_SETTINGS).marginPercentHuf).toEqual(
      { value: 20, source: "env" }
    )
    delete process.env.TOMKET_MARGIN_PERCENT
    expect(resolveTomketSettings(EMPTY_TOMKET_SETTINGS).marginPercentHuf).toEqual(
      { value: null, source: "missing" }
    )
  })

  it("feeds the pricing config so the admin margin is what prices use", () => {
    const resolved = resolveTomketSettings({
      ...EMPTY_TOMKET_SETTINGS,
      marginPercentHuf: 25,
      hufRounding: 100,
    })
    const { config, missing } = resolveTomketPricingConfig({
      eurHufRate: 400,
      marginPercentHuf: resolved.marginPercentHuf.value,
      marginPercentEur: resolved.marginPercentEur.value,
      includeShipping: resolved.includeShipping.value,
      hufRounding: resolved.hufRounding.value,
    })
    expect(missing).toEqual([])
    expect(config).toMatchObject({
      eurHufRate: 400,
      marginPercentHuf: 25,
      marginPercentEur: 25,
      hufRounding: 100,
      includeShipping: false,
    })
  })
})

describe("catalogue enrichment", () => {
  it("builds a storefront-ready description with facts and guidance", () => {
    const description = buildTomketDescription(ROW)
    expect(description).toContain("Barum Brillantis 2 155/70R13 75T — személy nyári gumiabroncs.")
    expect(description).toContain("- méret: 155/70R13")
    expect(description).toContain("- terhelési index / sebességjel: 75T")
    expect(description).toContain("- EU címke: gördülési ellenállás E, nedves tapadás C, zajszint 70 dB (2)")
    expect(description).toContain("- tömeg: 5,1 kg")
    expect(description).toContain("- EAN: 4024063580473")
    expect(description).toContain("Nyári abroncs:")
    expect(description).toContain("Választási útmutató")
  })

  it("derives SEO metadata in the catalogue's format", () => {
    const seo = buildTomketSeo(ROW)
    expect(seo.seo_title).toBe("155/70R13 75T Brillantis 2 Barum személy nyári gumi | TehergumiNet")
    expect(seo.seo_description.length).toBeLessThanOrEqual(160)
    expect(seo.seo_description).toContain("Barum Brillantis 2 155/70R13 75T")
  })

  it("maps the tyre type to a storefront category", () => {
    expect(buildTomketTypeCategory("PS")).toEqual({
      name: "Személy nyári gumi",
      handle: "szemely-nyari-gumi",
      label: "Személy nyári",
    })
    expect(buildTomketTypeCategory("AG").handle).toBe("mezogazdasagi-gumi")
  })
})

describe("settings edge cases", () => {
  it("accepts a zero margin explicitly (B2B / cost-price mode) but never by accident", () => {
    expect(parseTomketSettingsInput({ marginPercentHuf: "0" }).marginPercentHuf).toBe(0)
    expect(parseTomketSettingsInput({ marginPercentHuf: "" }).marginPercentHuf).toBeNull()
  })

  it("reads includeShipping from booleans and 1/0 strings, rejects garbage", () => {
    expect(parseTomketSettingsInput({ includeShipping: "1" }).includeShipping).toBe(true)
    expect(parseTomketSettingsInput({ includeShipping: 0 }).includeShipping).toBe(false)
    expect(() => parseTomketSettingsInput({ includeShipping: "maybe" })).toThrow(
      TomketSettingsValidationError
    )
  })

  it("marks the EUR margin as inherited when only HUF is set", () => {
    const resolved = resolveTomketSettings({
      ...EMPTY_TOMKET_SETTINGS,
      marginPercentHuf: 30,
    })
    expect(resolved.marginPercentEur).toEqual({ value: 30, source: "inherited" })
  })
})
