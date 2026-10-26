import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  INTERVALS,
  buildReport,
  defaultInterval,
  dominantCurrency,
  type AnalyticsOrder,
  type Interval,
} from "../../../lib/woo-analytics"

/**
 * GET /admin/woo-analytics
 *
 * WooCommerce-style sales report for the admin "Analitika" page. Query:
 *   from, to                 ISO instants (required) — the selected period
 *   compare_from, compare_to ISO instants (optional) — previous period / previous year
 *   interval                 hour | day | week | month (default: by range length)
 *   tz                       IANA zone used for bucketing (default Europe/Budapest)
 *   currency                 report currency (default: most frequent in the period)
 *
 * Canceled and draft orders are excluded. Auth: Medusa's built-in /admin/* guard.
 */

const PAGE = 500
const MAX_RANGE_DAYS = 3 * 366

const ORDER_FIELDS = [
  "id",
  "created_at",
  "currency_code",
  "total",
  "item_total",
  "item_tax_total",
  "shipping_total",
  "tax_total",
  "discount_total",
  "items.id",
  "items.title",
  "items.product_id",
  "items.product_title",
  "items.variant_sku",
  "items.quantity",
  "items.unit_price",
  "items.total",
  "items.tax_total",
  "items.adjustments.code",
  "items.adjustments.amount",
]

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

const parseDate = (v: unknown, name: string): Date => {
  const d = typeof v === "string" ? new Date(v) : new Date(NaN)
  if (Number.isNaN(d.getTime())) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid or missing '${name}' (ISO date expected)`)
  }
  return d
}

const checkRange = (from: Date, to: Date, label: string) => {
  if (to < from) throw new MedusaError(MedusaError.Types.INVALID_DATA, `${label}: 'to' is before 'from'`)
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `${label}: range longer than ${MAX_RANGE_DAYS} days`)
  }
}

const isValidTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

type Query = { graph: (cfg: Record<string, unknown>) => Promise<{ data: any[] }> }

const fetchOrders = async (query: Query, from: Date, to: Date): Promise<AnalyticsOrder[]> => {
  const out: AnalyticsOrder[] = []
  for (let skip = 0; ; skip += PAGE) {
    const { data } = await query.graph({
      entity: "order",
      fields: ORDER_FIELDS,
      filters: {
        created_at: { $gte: from, $lte: to },
        status: { $nin: ["canceled", "draft"] },
        is_draft_order: false,
      },
      pagination: { skip, take: PAGE, order: { created_at: "ASC" } },
    })
    for (const o of data) {
      const items = (o.items ?? []).map((it: any) => {
        const qty = Math.max(0, num(it.quantity))
        const total = it.total != null ? num(it.total) - num(it.tax_total) : num(it.unit_price) * qty
        return {
          product_id: it.product_id ?? null,
          title: it.product_title || it.title || "—",
          sku: it.variant_sku ?? null,
          quantity: qty,
          net: total,
        }
      })
      const coupons: { code: string; amount: number }[] = []
      for (const it of o.items ?? []) {
        for (const adj of it.adjustments ?? []) {
          if (adj?.code) coupons.push({ code: String(adj.code), amount: num(adj.amount) })
        }
      }
      const itemNet = o.item_total != null ? num(o.item_total) - num(o.item_tax_total) : items.reduce((a: number, it: { net: number }) => a + it.net, 0)
      out.push({
        id: o.id,
        created_at: new Date(o.created_at),
        currency_code: String(o.currency_code ?? "").toLowerCase(),
        gross: num(o.total),
        net: itemNet,
        shipping: num(o.shipping_total),
        tax: num(o.tax_total),
        discount: num(o.discount_total),
        items,
        coupons,
      })
    }
    if (data.length < PAGE) break
  }
  return out
}

const categoriesFor = async (query: Query, orders: AnalyticsOrder[]) => {
  const ids = [...new Set(orders.flatMap((o) => o.items.map((it) => it.product_id).filter(Boolean)))] as string[]
  const map = new Map<string, string[]>()
  for (let i = 0; i < ids.length; i += PAGE) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "categories.name"],
      filters: { id: ids.slice(i, i + PAGE) },
    })
    for (const p of data) {
      map.set(p.id, (p.categories ?? []).map((c: any) => c?.name).filter(Boolean))
    }
  }
  return map
}

export const GET = async (req: MedusaRequest, res: MedusaResponse): Promise<void> => {
  const q = req.query as Record<string, string | undefined>
  const from = parseDate(q.from, "from")
  const to = parseDate(q.to, "to")
  checkRange(from, to, "period")

  const hasCompare = Boolean(q.compare_from && q.compare_to)
  const cFrom = hasCompare ? parseDate(q.compare_from, "compare_from") : null
  const cTo = hasCompare ? parseDate(q.compare_to, "compare_to") : null
  if (cFrom && cTo) checkRange(cFrom, cTo, "compare")

  const interval: Interval = INTERVALS.includes(q.interval as Interval)
    ? (q.interval as Interval)
    : defaultInterval(from, to)
  const tz = q.tz && isValidTz(q.tz) ? q.tz : "Europe/Budapest"

  const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)

  const [current, previous] = await Promise.all([
    fetchOrders(query, from, to),
    cFrom && cTo ? fetchOrders(query, cFrom, cTo) : Promise.resolve([] as AnalyticsOrder[]),
  ])

  const currencies = [...new Set([...current, ...previous].map((o) => o.currency_code))].sort()
  const currency = (q.currency || "").toLowerCase() || dominantCurrency(current.length ? current : previous, "huf")
  const inCurrency = (list: AnalyticsOrder[]) => list.filter((o) => o.currency_code === currency)

  const cur = inCurrency(current)
  const prev = inCurrency(previous)
  const categoriesByProduct = await categoriesFor(query, [...cur, ...prev])

  res.json({
    currency,
    currencies,
    interval,
    tz,
    current: buildReport({ orders: cur, from, to, interval, tz, categoriesByProduct }),
    compare:
      cFrom && cTo
        ? buildReport({ orders: prev, from: cFrom, to: cTo, interval, tz, categoriesByProduct })
        : null,
  })
}
