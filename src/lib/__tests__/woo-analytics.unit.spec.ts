import { bucketKey, bucketKeys, buildReport, defaultInterval, type AnalyticsOrder } from "../woo-analytics"
import { compareRange, presetRange } from "../../admin/lib/analytics-ranges"

const TZ = "Europe/Budapest"

const order = (id: string, iso: string, net: number, extra: Partial<AnalyticsOrder> = {}): AnalyticsOrder => ({
  id,
  created_at: new Date(iso),
  currency_code: "huf",
  gross: net * 1.27,
  net,
  shipping: 0,
  tax: net * 0.27,
  discount: 0,
  items: [{ product_id: "prod_1", title: "Komposztáló", sku: "K1", quantity: 2, net }],
  coupons: [],
  ...extra,
})

describe("woo-analytics engine", () => {
  it("buckets by the local calendar, not UTC", () => {
    // 23:30 UTC on Oct 4 is already Oct 5 in Budapest (UTC+2).
    expect(bucketKey(new Date("2026-10-04T23:30:00Z"), "day", TZ)).toBe("2026-10-05")
    expect(bucketKey(new Date("2026-10-07T10:00:00Z"), "week", TZ)).toBe("2026-10-05")
    expect(bucketKey(new Date("2026-10-07T10:00:00Z"), "month", TZ)).toBe("2026-10")
  })

  it("emits one bucket per day across a DST change", () => {
    // Budapest leaves DST on 2026-10-25.
    const keys = bucketKeys(new Date("2026-10-23T22:00:00Z"), new Date("2026-10-27T22:59:59Z"), "day", TZ)
    expect(keys).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"])
  })

  it("picks Woo-like default intervals", () => {
    const d = (s: string) => new Date(s)
    expect(defaultInterval(d("2026-10-26T00:00:00Z"), d("2026-10-26T23:59:59Z"))).toBe("hour")
    expect(defaultInterval(d("2026-10-01T00:00:00Z"), d("2026-10-26T23:59:59Z"))).toBe("day")
    expect(defaultInterval(d("2026-01-01T00:00:00Z"), d("2026-10-26T23:59:59Z"))).toBe("month")
  })

  it("totals, series and leaderboards only count orders inside the range", () => {
    const report = buildReport({
      orders: [
        order("o1", "2026-10-02T10:00:00Z", 1000, { coupons: [{ code: "nyar10", amount: 100 }] }),
        order("o2", "2026-10-02T12:00:00Z", 3000),
        order("o3", "2026-09-30T12:00:00Z", 9999),
      ],
      from: new Date("2026-09-30T22:00:00Z"),
      to: new Date("2026-10-03T21:59:59Z"),
      interval: "day",
      tz: TZ,
      categoriesByProduct: new Map([["prod_1", ["Kert", "Akció"]]]),
    })
    expect(report.totals.orders).toBe(2)
    expect(report.totals.net).toBe(4000)
    expect(report.totals.aov).toBe(2000)
    expect(report.totals.items_sold).toBe(4)
    expect(report.series.map((p) => [p.key, p.net])).toEqual([
      ["2026-10-01", 0],
      ["2026-10-02", 4000],
      ["2026-10-03", 0],
    ])
    expect(report.top_products[0]).toMatchObject({ key: "prod_1", quantity: 4, net: 4000, orders: 2 })
    expect(report.top_categories.map((c) => c.label).sort()).toEqual(["Akció", "Kert"])
    expect(report.top_coupons[0]).toMatchObject({ label: "NYAR10", orders: 1, net: 100 })
  })
})

describe("analytics date ranges", () => {
  const now = new Date(2026, 9, 26, 15, 0) // 2026-10-26 local

  it("this month runs to the end of today, previous year shifts both ends", () => {
    const r = presetRange("month", now)
    expect([r.from.getMonth(), r.from.getDate()]).toEqual([9, 1])
    expect([r.to.getDate(), r.to.getHours()]).toEqual([26, 23])
    const py = compareRange(r, "month", "previous_year")!
    expect([py.from.getFullYear(), py.from.getMonth(), py.to.getDate()]).toEqual([2025, 9, 26])
  })

  it("previous period of a calendar preset steps back one unit", () => {
    const pp = compareRange(presetRange("month", now), "month", "previous_period")!
    expect([pp.from.getMonth(), pp.from.getDate(), pp.to.getMonth(), pp.to.getDate()]).toEqual([8, 1, 8, 26])
    const lm = compareRange(presetRange("last_month", now), "last_month", "previous_period")!
    // last month = September (30 days) → previous period = all of August
    expect([lm.from.getMonth(), lm.to.getMonth(), lm.to.getDate()]).toEqual([7, 7, 31])
  })

  it("last quarter and this week resolve to calendar boundaries", () => {
    const lq = presetRange("last_quarter", now)
    expect([lq.from.getMonth(), lq.from.getDate(), lq.to.getMonth(), lq.to.getDate()]).toEqual([6, 1, 8, 30])
    const w = presetRange("week", now)
    expect([w.from.getDay(), w.from.getDate()]).toEqual([1, 26])
  })
})
