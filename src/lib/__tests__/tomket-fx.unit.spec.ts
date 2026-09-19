import {
  applyTomketFxMarkup,
  isTomketFxStale,
  parseEcbHufRate,
  resolveTomketPricing,
  type TomketFxRate,
} from "../tomket-fx"
import { isTomketRunActive, writeStoreMetadata } from "../tomket-status"

const ECB_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time='2026-09-18'>
      <Cube currency='USD' rate='1.1742'/>
      <Cube currency='HUF' rate='364.28'/>
      <Cube currency='CZK' rate='24.310'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`

const storeState: { metadata: Record<string, unknown> } = { metadata: {} }

const makeContainer = () =>
  ({
    resolve: () => ({
      listStores: async () => [{ id: "store_1", metadata: storeState.metadata }],
      updateStores: async (
        _id: string,
        update: { metadata: Record<string, unknown> }
      ) => {
        storeState.metadata = update.metadata
      },
    }),
  }) as never

describe("parseEcbHufRate", () => {
  it("reads the HUF rate and reference date", () => {
    expect(parseEcbHufRate(ECB_SAMPLE)).toEqual({
      rate: 364.28,
      date: "2026-09-18",
    })
  })

  it("returns null when HUF is missing", () => {
    expect(parseEcbHufRate(ECB_SAMPLE.replace("HUF", "PLN"))).toBeNull()
  })
})

describe("isTomketFxStale", () => {
  const fx: TomketFxRate = {
    rate: 364.28,
    date: "2026-09-18",
    source: "ecb",
    fetchedAt: "",
  }

  it("accepts a rate from the last week (weekends, holidays)", () => {
    expect(isTomketFxStale(fx, new Date("2026-09-24T12:00:00Z"))).toBe(false)
  })

  it("rejects a rate older than a week", () => {
    expect(isTomketFxStale(fx, new Date("2026-09-27T12:00:00Z"))).toBe(true)
  })
})

describe("applyTomketFxMarkup", () => {
  it("pads the mid rate and rounds to 2 decimals", () => {
    expect(applyTomketFxMarkup(364.28, 1.5)).toBe(369.74)
    expect(applyTomketFxMarkup(364.28, 0)).toBe(364.28)
  })
})

describe("resolveTomketPricing", () => {
  const env = { ...process.env }

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.TOMKET_EUR_HUF_RATE
    delete process.env.TOMKET_EUR_HUF_MARKUP_PERCENT
    process.env.TOMKET_MARGIN_PERCENT = "20"
    storeState.metadata = {}
  })

  afterAll(() => {
    process.env = env
  })

  it("prefers the env override", async () => {
    process.env.TOMKET_EUR_HUF_RATE = "400"
    const result = await resolveTomketPricing(makeContainer(), {
      allowLiveFetch: false,
    })
    expect(result.config?.eurHufRate).toBe(400)
    expect(result.fx).toEqual({
      source: "env",
      rate: 400,
      date: null,
      markupPercent: 0,
    })
  })

  it("uses the stored ECB rate with the markup", async () => {
    process.env.TOMKET_EUR_HUF_MARKUP_PERCENT = "1"
    storeState.metadata = {
      tomket_fx: {
        rate: 364.28,
        date: new Date().toISOString().slice(0, 10),
        source: "ecb",
        fetchedAt: new Date().toISOString(),
      },
    }
    const result = await resolveTomketPricing(makeContainer(), {
      allowLiveFetch: false,
    })
    expect(result.config?.eurHufRate).toBe(367.92)
    expect(result.fx?.source).toBe("ecb")
    expect(result.missing).toEqual([])
  })

  it("reports the rate as missing when nothing is stored and no live fetch", async () => {
    const result = await resolveTomketPricing(makeContainer(), {
      allowLiveFetch: false,
    })
    expect(result.config).toBeUndefined()
    expect(result.missing[0]).toMatch(/TOMKET_EUR_HUF_RATE/)
  })

  it("still refuses to price without a margin", async () => {
    delete process.env.TOMKET_MARGIN_PERCENT
    process.env.TOMKET_EUR_HUF_RATE = "400"
    const result = await resolveTomketPricing(makeContainer(), {
      allowLiveFetch: false,
    })
    expect(result.config).toBeUndefined()
    expect(result.missing).toEqual(["TOMKET_MARGIN_PERCENT"])
  })
})

describe("writeStoreMetadata ordering", () => {
  it("applies writes in call order even when the first one is slower", async () => {
    const state: { metadata: Record<string, unknown> } = { metadata: {} }
    let delay = 30
    const container = {
      resolve: () => ({
        listStores: async () => {
          const wait = delay
          delay = 0
          await new Promise((resolve) => setTimeout(resolve, wait))
          return [{ id: "store_1", metadata: state.metadata }]
        },
        updateStores: async (
          _id: string,
          update: { metadata: Record<string, unknown> }
        ) => {
          state.metadata = update.metadata
        },
      }),
    } as never

    void writeStoreMetadata(container, "tomket_import", { state: "running" })
    await writeStoreMetadata(container, "tomket_import", { state: "done" })

    expect(state.metadata).toEqual({ tomket_import: { state: "done" } })
  })
})

describe("isTomketRunActive", () => {
  it("treats a recent running status as active and an old one as an orphan", async () => {
    const now = Date.parse("2026-09-19T12:00:00Z")
    expect(
      isTomketRunActive({ state: "running", startedAt: "2026-09-19T11:30:00Z" }, now)
    ).toBe(true)
    expect(
      isTomketRunActive({ state: "running", startedAt: "2026-09-19T09:00:00Z" }, now)
    ).toBe(false)
    expect(isTomketRunActive({ state: "done", startedAt: null }, now)).toBe(false)
  })
})
