/**
 * WooCommerce-style analytics engine (pure, no Medusa imports so it is unit
 * testable). The admin route normalizes orders into {@link AnalyticsOrder}s and
 * this module buckets them into a continuous time series plus totals and
 * leaderboards — the same numbers WooCommerce's "Analytics → Overview" shows.
 *
 * Buckets are keyed by the admin's local calendar (the `tz` the browser sends),
 * so "today" and month boundaries match what the operator sees on the wall.
 */

export type Interval = "hour" | "day" | "week" | "month"

export const INTERVALS: Interval[] = ["hour", "day", "week", "month"]

export type AnalyticsItem = {
  product_id: string | null
  title: string
  sku: string | null
  quantity: number
  /** Line revenue after discounts, excluding tax. */
  net: number
}

export type AnalyticsOrder = {
  id: string
  created_at: Date
  currency_code: string
  /** Order grand total (items + shipping + tax − discounts). */
  gross: number
  /** Items after discounts, excluding tax and shipping (Woo "net sales"). */
  net: number
  shipping: number
  tax: number
  discount: number
  items: AnalyticsItem[]
  coupons: { code: string; amount: number }[]
}

export type Totals = {
  gross: number
  net: number
  orders: number
  aov: number
  items_sold: number
  shipping: number
  tax: number
  discount: number
}

export type SeriesPoint = { key: string; gross: number; net: number; orders: number; items_sold: number }

export type LeaderRow = { key: string; label: string; quantity: number; net: number; orders: number }

export type PeriodReport = {
  from: string
  to: string
  totals: Totals
  series: SeriesPoint[]
  top_products: LeaderRow[]
  top_categories: LeaderRow[]
  top_coupons: LeaderRow[]
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const pad = (n: number) => String(n).padStart(2, "0")

const partsCache = new Map<string, Intl.DateTimeFormat>()

/** Local wall-clock parts of `date` in `tz`. */
export const localParts = (date: Date, tz: string) => {
  let fmt = partsCache.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
    partsCache.set(tz, fmt)
  }
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) }
}

/** Bucket key for `date`: `YYYY-MM-DD HH`, `YYYY-MM-DD`, Monday `YYYY-MM-DD`, or `YYYY-MM`. */
export const bucketKey = (date: Date, interval: Interval, tz: string): string => {
  const { y, m, d, h } = localParts(date, tz)
  switch (interval) {
    case "hour":
      return `${y}-${pad(m)}-${pad(d)} ${pad(h)}`
    case "day":
      return `${y}-${pad(m)}-${pad(d)}`
    case "week": {
      const utc = new Date(Date.UTC(y, m - 1, d))
      const back = (utc.getUTCDay() + 6) % 7
      const monday = new Date(utc.getTime() - back * DAY_MS)
      return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`
    }
    case "month":
      return `${y}-${pad(m)}`
  }
}

/**
 * Every bucket key between `from` and `to` (inclusive), in order. Days are
 * stepped from local noon so a DST shift never skips or repeats a date.
 */
export const bucketKeys = (from: Date, to: Date, interval: Interval, tz: string): string[] => {
  const keys: string[] = []
  const seen = new Set<string>()
  const push = (k: string) => {
    if (!seen.has(k)) {
      seen.add(k)
      keys.push(k)
    }
  }
  if (interval === "hour") {
    for (let t = from.getTime(); t <= to.getTime(); t += HOUR_MS) push(bucketKey(new Date(t), interval, tz))
  } else {
    for (let t = from.getTime() + 12 * HOUR_MS; t <= to.getTime() + 12 * HOUR_MS; t += DAY_MS) {
      push(bucketKey(new Date(Math.min(t, to.getTime())), interval, tz))
    }
  }
  return keys
}

/** Woo's default interval for a range length. */
export const defaultInterval = (from: Date, to: Date): Interval => {
  const days = (to.getTime() - from.getTime()) / DAY_MS
  if (days <= 2) return "hour"
  if (days <= 62) return "day"
  if (days <= 190) return "week"
  return "month"
}

const emptyTotals = (): Totals => ({
  gross: 0,
  net: 0,
  orders: 0,
  aov: 0,
  items_sold: 0,
  shipping: 0,
  tax: 0,
  discount: 0,
})

const round2 = (n: number) => Math.round(n * 100) / 100

type Acc = { label: string; quantity: number; net: number; orders: Set<string> }

const bump = (map: Map<string, Acc>, key: string, label: string, orderId: string, qty: number, net: number) => {
  let row = map.get(key)
  if (!row) {
    row = { label, quantity: 0, net: 0, orders: new Set() }
    map.set(key, row)
  }
  row.quantity += qty
  row.net += net
  row.orders.add(orderId)
}

const leaders = (map: Map<string, Acc>, limit: number, by: "net" | "quantity" = "net"): LeaderRow[] =>
  [...map.entries()]
    .map(([key, r]) => ({ key, label: r.label, quantity: r.quantity, net: round2(r.net), orders: r.orders.size }))
    .sort((a, b) => b[by] - a[by] || b.quantity - a.quantity)
    .slice(0, limit)

export type BuildReportInput = {
  orders: AnalyticsOrder[]
  from: Date
  to: Date
  interval: Interval
  tz: string
  /** product_id → category names; products in several categories count in each (as Woo does). */
  categoriesByProduct?: Map<string, string[]>
  limit?: number
}

export const buildReport = ({
  orders,
  from,
  to,
  interval,
  tz,
  categoriesByProduct = new Map(),
  limit = 10,
}: BuildReportInput): PeriodReport => {
  const totals = emptyTotals()
  const series = new Map<string, SeriesPoint>()
  for (const key of bucketKeys(from, to, interval, tz)) {
    series.set(key, { key, gross: 0, net: 0, orders: 0, items_sold: 0 })
  }
  const products = new Map<string, Acc>()
  const categories = new Map<string, Acc>()
  const coupons = new Map<string, Acc>()

  for (const o of orders) {
    const t = o.created_at.getTime()
    if (t < from.getTime() || t > to.getTime()) continue
    const qty = o.items.reduce((acc, it) => acc + it.quantity, 0)

    totals.gross += o.gross
    totals.net += o.net
    totals.orders += 1
    totals.items_sold += qty
    totals.shipping += o.shipping
    totals.tax += o.tax
    totals.discount += o.discount

    const point = series.get(bucketKey(o.created_at, interval, tz))
    if (point) {
      point.gross += o.gross
      point.net += o.net
      point.orders += 1
      point.items_sold += qty
    }

    for (const it of o.items) {
      const key = it.product_id ?? `title:${it.title}`
      bump(products, key, it.title, o.id, it.quantity, it.net)
      for (const cat of (it.product_id && categoriesByProduct.get(it.product_id)) || []) {
        bump(categories, cat, cat, o.id, it.quantity, it.net)
      }
    }
    for (const c of o.coupons) {
      bump(coupons, c.code.toUpperCase(), c.code.toUpperCase(), o.id, 0, c.amount)
    }
  }

  totals.aov = totals.orders ? totals.net / totals.orders : 0
  for (const k of Object.keys(totals) as (keyof Totals)[]) totals[k] = round2(totals[k])

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totals,
    series: [...series.values()].map((p) => ({ ...p, gross: round2(p.gross), net: round2(p.net) })),
    top_products: leaders(products, limit),
    top_categories: leaders(categories, limit),
    top_coupons: leaders(coupons, limit),
  }
}

/** Most frequent currency among `orders` (ties → alphabetical), or `fallback`. */
export const dominantCurrency = (orders: { currency_code: string }[], fallback: string): string => {
  const counts = new Map<string, number>()
  for (const o of orders) counts.set(o.currency_code, (counts.get(o.currency_code) ?? 0) + 1)
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  return best ? best[0] : fallback
}
