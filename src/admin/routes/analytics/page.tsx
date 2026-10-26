import { useEffect, useMemo, useState, type ReactNode } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChartBar, TriangleUpMini, TriangleDownMini } from "@medusajs/icons"
import { Heading, Text, toast } from "@medusajs/ui"
import {
  compareRange,
  customRange,
  presetRange,
  toIsoDate,
  type CompareKey,
  type PresetKey,
  type Range,
} from "../../lib/analytics-ranges"

// WooCommerce Analytics mintájú áttekintő: időszak-presetek + egyéni dátum,
// összehasonlítás (előző időszak / előző év), KPI kártyák, két idősor a
// összehasonlító vonallal, és toplisták. Az adatokat a szerver számolja
// (GET /admin/woo-analytics), így nincs rendelésszám-korlát.

const LOCALE = "hu-HU"

// Feliratok egy helyen, hogy másik nyelvű admin (pl. szlovák) egyszerűen fordítható legyen.
const T = {
  title: "Analitika",
  dateRange: "Időintervallum",
  presetsTab: "Előre beállított",
  customTab: "Egyéni",
  compareBy: "Összehasonlítás alapja",
  update: "Frissítés",
  interval: "Bontás",
  line: "Vonal",
  bar: "Oszlop",
  loading: "Adatok betöltése…",
  noCompare: "nincs összehasonlítás",
  vsPrev: "vs. előző",
  performance: "Teljesítmény",
  charts: "Diagramok",
  leaderboards: "Toplisták",
  topCategories: "Top kategóriák – eladás alapján",
  topProducts: "Top termékek – eladás alapján",
  topCoupons: "Top kuponok – rendelések alapján",
  colCategory: "Kategória",
  colProduct: "Termék",
  colCoupon: "Kuponkód",
  colItems: "Eladott tételek",
  colOrders: "Rendelések",
  colNet: "Nettó árbevétel",
  colDiscount: "Kedvezmény",
  empty: "Nincs adat ebben az időszakban.",
  currency: "Pénznem",
  footnote: "Törölt és piszkozat rendelések nélkül. A nettó árbevétel a termékek kedvezmény utáni, adó és szállítás nélküli összege.",
  presets: {
    today: "Ma",
    yesterday: "Tegnap",
    week: "Ez a hét",
    last_week: "Múlt hét",
    month: "Ez a hónap",
    last_month: "Múlt hónap",
    quarter: "Ez a negyedév",
    last_quarter: "Múlt negyedév",
    year: "Ez az év",
    last_year: "Múlt év",
    custom: "Egyéni",
  } as Record<PresetKey, string>,
  compare: {
    previous_period: "Előző időszak",
    previous_year: "Előző év",
    none: "Nincs",
  } as Record<CompareKey, string>,
  intervals: { hour: "Óránként", day: "Naponta", week: "Hetente", month: "Havonta" } as Record<Interval, string>,
  metrics: {
    gross: "Összes eladás",
    net: "Nettó árbevétel",
    orders: "Rendelések",
    aov: "Átlag rendelési érték",
    items_sold: "Eladott termékek",
    shipping: "Szállítás",
    discount: "Kedvezmények",
    tax: "Adó",
  } as Record<MetricKey, string>,
}

const PRESET_ROWS: [PresetKey, PresetKey][] = [
  ["today", "yesterday"],
  ["week", "last_week"],
  ["month", "last_month"],
  ["quarter", "last_quarter"],
  ["year", "last_year"],
]

const ACCENT = "#2563eb"
const COMPARE = "#10b981"
const GREEN = "#16a34a"
const RED = "#dc2626"

type Interval = "hour" | "day" | "week" | "month"
type MetricKey = "gross" | "net" | "orders" | "aov" | "items_sold" | "shipping" | "discount" | "tax"
type SeriesMetric = "gross" | "net" | "orders" | "items_sold"

type Totals = Record<MetricKey, number>
type SeriesPoint = { key: string; gross: number; net: number; orders: number; items_sold: number }
type LeaderRow = { key: string; label: string; quantity: number; net: number; orders: number }
type PeriodReport = {
  from: string
  to: string
  totals: Totals
  series: SeriesPoint[]
  top_products: LeaderRow[]
  top_categories: LeaderRow[]
  top_coupons: LeaderRow[]
}
type Report = {
  currency: string
  currencies: string[]
  interval: Interval
  current: PeriodReport
  compare: PeriodReport | null
}

const MONEY_METRICS: MetricKey[] = ["gross", "net", "aov", "shipping", "discount", "tax"]
const KPI_ORDER: MetricKey[] = ["gross", "net", "orders", "aov", "items_sold", "shipping", "discount", "tax"]

const formatMoney = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: currency.toLowerCase() === "huf" ? 0 : 2,
    }).format(value)
  } catch {
    return `${Math.round(value)} ${currency.toUpperCase()}`
  }
}

const formatNumber = (value: number) => new Intl.NumberFormat(LOCALE).format(Math.round(value * 100) / 100)

const formatMetric = (metric: MetricKey, value: number, currency: string) =>
  MONEY_METRICS.includes(metric) ? formatMoney(value, currency) : formatNumber(value)

const formatRange = (from: Date, to: Date) => {
  const sameYear = from.getFullYear() === to.getFullYear()
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString(LOCALE, { year: withYear ? "numeric" : undefined, month: "short", day: "numeric" })
  return `${fmt(from, !sameYear)} – ${fmt(to, true)}`
}

const formatBucket = (key: string, interval: Interval) => {
  if (interval === "hour") return `${key.slice(11, 13)}:00`
  if (interval === "month") {
    const [y, m] = key.split("-").map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, { year: "numeric", month: "short" })
  }
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE, { month: "short", day: "numeric" })
}

const pctDelta = (cur: number, prev: number): number | null => {
  if (prev === 0) return cur === 0 ? 0 : null
  return ((cur - prev) / Math.abs(prev)) * 100
}

const defaultIntervalFor = (range: Range): Interval => {
  const days = (range.to.getTime() - range.from.getTime()) / 86_400_000
  if (days <= 2) return "hour"
  if (days <= 62) return "day"
  if (days <= 190) return "week"
  return "month"
}

const fetchReport = async (params: URLSearchParams): Promise<Report> => {
  const response = await fetch(`/admin/woo-analytics?${params.toString()}`, { credentials: "include" })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`)
  }
  return (await response.json()) as Report
}

// ── kis építőelemek ───────────────────────────────────────────────────────
const Segmented = <K extends string>({
  options,
  value,
  onChange,
}: {
  options: [K, string][]
  value: K
  onChange: (k: K) => void
}) => (
  <div className="inline-flex rounded-lg border border-ui-border-base bg-ui-bg-subtle p-0.5">
    {options.map(([k, label]) => (
      <button
        key={k}
        type="button"
        onClick={() => onChange(k)}
        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
          k === value ? "bg-ui-bg-base text-ui-fg-base shadow-sm" : "text-ui-fg-subtle hover:text-ui-fg-base"
        }`}
      >
        {label}
      </button>
    ))}
  </div>
)

const Card = ({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) => (
  <div className="rounded-xl border border-ui-border-base bg-ui-bg-base">
    <div className="flex items-center justify-between border-b border-ui-border-base px-5 py-3">
      <div className="text-[13.5px] font-semibold text-ui-fg-base">{title}</div>
      {right}
    </div>
    <div className="p-5">{children}</div>
  </div>
)

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <div className="mt-3 text-base font-semibold text-ui-fg-base">{children}</div>
)

// ── időszak választó (Woo stílusú lenyíló) ────────────────────────────────
type Selection = { preset: PresetKey; customFrom: string; customTo: string; compare: CompareKey }

const resolveRange = (s: Selection): Range =>
  s.preset === "custom"
    ? customRange(s.customFrom, s.customTo) ?? presetRange("month")
    : presetRange(s.preset)

const DateRangePicker = ({ value, onApply }: { value: Selection; onApply: (s: Selection) => void }) => {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Selection>(value)
  const [tab, setTab] = useState<"presets" | "custom">(value.preset === "custom" ? "custom" : "presets")

  useEffect(() => {
    if (open) {
      setDraft(value)
      setTab(value.preset === "custom" ? "custom" : "presets")
    }
  }, [open, value])

  const range = resolveRange(value)
  const cmp = compareRange(range, value.preset, value.compare)

  return (
    <div className="relative">
      <Text size="xsmall" className="mb-1 text-ui-fg-subtle">
        {T.dateRange}
      </Text>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-[300px] items-center justify-between gap-x-4 rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 text-left"
      >
        <span>
          <span className="block text-xs font-medium text-ui-fg-base">
            {T.presets[value.preset]} ({formatRange(range.from, range.to)})
          </span>
          <span className="block text-[11px] text-ui-fg-subtle">
            {cmp ? `vs. ${T.compare[value.compare]} (${formatRange(cmp.from, cmp.to)})` : T.noCompare}
          </span>
        </span>
        <span className="text-ui-fg-muted">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="absolute z-20 mt-1 w-[320px] rounded-lg border border-ui-border-base bg-ui-bg-base shadow-elevation-flyout">
          <div className="grid grid-cols-2 border-b border-ui-border-base text-xs">
            {(["presets", "custom"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t)
                  if (t === "custom") setDraft((d) => ({ ...d, preset: "custom" }))
                }}
                className={`py-2.5 font-medium ${
                  tab === t ? "border-b-2 border-ui-fg-interactive text-ui-fg-base" : "text-ui-fg-subtle"
                }`}
              >
                {t === "presets" ? T.presetsTab : T.customTab}
              </button>
            ))}
          </div>

          {tab === "presets" ? (
            <div className="grid grid-cols-2">
              {PRESET_ROWS.flat().map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, preset: p }))}
                  className={`border-b border-ui-border-base px-4 py-2.5 text-left text-xs odd:border-r ${
                    draft.preset === p ? "font-semibold text-ui-fg-interactive" : "text-ui-fg-subtle hover:bg-ui-bg-base-hover"
                  }`}
                >
                  {T.presets[p]}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-x-2 border-b border-ui-border-base p-4">
              <input
                type="date"
                value={draft.customFrom}
                onChange={(e) => setDraft((d) => ({ ...d, preset: "custom", customFrom: e.target.value }))}
                className="flex-1 rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-xs text-ui-fg-base"
              />
              <span className="text-ui-fg-muted">–</span>
              <input
                type="date"
                value={draft.customTo}
                onChange={(e) => setDraft((d) => ({ ...d, preset: "custom", customTo: e.target.value }))}
                className="flex-1 rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-xs text-ui-fg-base"
              />
            </div>
          )}

          <div className="px-4 pb-1 pt-3 text-center text-[10.5px] font-medium uppercase tracking-wide text-ui-fg-muted">
            {T.compareBy}
          </div>
          <div className="grid grid-cols-3 border-b border-ui-border-base">
            {(["previous_period", "previous_year", "none"] as CompareKey[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, compare: c }))}
                className={`px-2 py-2.5 text-xs ${
                  draft.compare === c ? "font-semibold text-ui-fg-interactive" : "text-ui-fg-subtle hover:bg-ui-bg-base-hover"
                }`}
              >
                {T.compare[c]}
              </button>
            ))}
          </div>
          <div className="flex justify-center p-3">
            <button
              type="button"
              disabled={draft.preset === "custom" && !customRange(draft.customFrom, draft.customTo)}
              onClick={() => {
                onApply(draft)
                setOpen(false)
              }}
              className="rounded-md bg-ui-button-inverted px-5 py-1.5 text-xs font-medium text-ui-fg-on-inverted disabled:opacity-50"
            >
              {T.update}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ── KPI kártya ────────────────────────────────────────────────────────────
const KpiCard = ({
  label,
  value,
  delta,
  invert,
  active,
  onClick,
}: {
  label: string
  value: string
  delta: number | null
  invert?: boolean
  active: boolean
  onClick?: () => void
}) => {
  const good = delta !== null && (invert ? delta <= 0 : delta >= 0)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex flex-col rounded-none border-ui-border-base p-4 text-left transition-colors ${
        active ? "bg-ui-bg-subtle shadow-[inset_0_3px_0_0_#2563eb]" : "bg-ui-bg-base hover:bg-ui-bg-base-hover"
      } disabled:cursor-default`}
    >
      <span className="text-xs text-ui-fg-subtle">{label}</span>
      <span className="mt-2 flex items-center justify-between gap-x-2">
        <span className="text-xl font-semibold tabular-nums text-ui-fg-base">{value}</span>
        {delta === null ? null : (
          <span
            className="inline-flex items-center gap-x-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
            style={{ background: good ? GREEN : RED }}
          >
            {delta >= 0 ? <TriangleUpMini /> : <TriangleDownMini />}
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </span>
    </button>
  )
}

// ── idősor diagram (vonal / oszlop, összehasonlító sorozattal) ────────────
const TimeChart = ({
  current,
  compare,
  interval,
  metric,
  currency,
  kind,
  curLabel,
  cmpLabel,
}: {
  current: SeriesPoint[]
  compare: SeriesPoint[] | null
  interval: Interval
  metric: SeriesMetric
  currency: string
  kind: "line" | "bar"
  curLabel: string
  cmpLabel: string | null
}) => {
  const [hover, setHover] = useState<number | null>(null)
  const w = 760
  const h = 260
  const left = 64
  const bottom = 28
  const top = 10
  const plotW = w - left - 10
  const plotH = h - top - bottom
  const n = current.length
  const cur = current.map((p) => p[metric])
  const cmp = compare ? current.map((_, i) => compare[i]?.[metric] ?? 0) : null
  const max = Math.max(1, ...cur, ...(cmp ?? []))
  const isMoney = metric === "gross" || metric === "net"
  const fmt = (v: number) => (isMoney ? formatMoney(v, currency) : formatNumber(v))
  const slot = plotW / Math.max(1, n)
  const x = (i: number) => left + slot * i + slot / 2
  const y = (v: number) => top + plotH - (v / max) * plotH
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
  const labelEvery = Math.max(1, Math.ceil(n / 8))

  if (n === 0) return <Text size="xsmall" className="text-ui-fg-subtle">{T.empty}</Text>

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full" style={{ height: h }} onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3].map((i) => {
          const v = (max / 3) * i
          return (
            <g key={i}>
              <line x1={left} x2={w - 10} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-ui-border-base" />
              <text x={left - 6} y={y(v) + 3} textAnchor="end" fontSize="10" className="fill-ui-fg-muted">
                {isMoney ? new Intl.NumberFormat(LOCALE, { notation: "compact" }).format(v) : formatNumber(v)}
              </text>
            </g>
          )
        })}
        {current.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.key} x={x(i)} y={h - 8} textAnchor="middle" fontSize="10" className="fill-ui-fg-muted">
              {formatBucket(p.key, interval)}
            </text>
          ) : null
        )}

        {kind === "bar" ? (
          current.map((_, i) => {
            const bw = Math.max(2, slot * (cmp ? 0.36 : 0.6))
            return (
              <g key={i}>
                <rect x={x(i) - (cmp ? bw : bw / 2)} y={y(cur[i])} width={bw} height={top + plotH - y(cur[i])} fill={ACCENT} rx="1.5" />
                {cmp ? <rect x={x(i)} y={y(cmp[i])} width={bw} height={top + plotH - y(cmp[i])} fill={COMPARE} rx="1.5" /> : null}
              </g>
            )
          })
        ) : (
          <>
            {cmp ? <path d={path(cmp)} fill="none" stroke={COMPARE} strokeWidth="2" /> : null}
            <path d={path(cur)} fill="none" stroke={ACCENT} strokeWidth="2.5" />
            {cur.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : n <= 40 ? 3 : 0} fill={ACCENT} />
            ))}
            {cmp?.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : n <= 40 ? 2.5 : 0} fill={COMPARE} />)}
          </>
        )}

        {hover !== null ? (
          <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + plotH} stroke="currentColor" className="text-ui-fg-muted" strokeDasharray="3 3" />
        ) : null}
        {current.map((_, i) => (
          <rect key={i} x={left + slot * i} y={top} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>

      {hover !== null ? (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-[11px] shadow-elevation-tooltip"
          style={{ left: `${Math.min(70, (x(hover) / w) * 100)}%` }}
        >
          <div className="flex items-center gap-x-2">
            <span className="size-2 rounded-sm" style={{ background: ACCENT }} />
            <span className="text-ui-fg-subtle">{formatBucket(current[hover].key, interval)}</span>
            <span className="ml-auto pl-3 font-semibold tabular-nums text-ui-fg-base">{fmt(cur[hover])}</span>
          </div>
          {cmp && compare?.[hover] ? (
            <div className="mt-1 flex items-center gap-x-2">
              <span className="size-2 rounded-sm" style={{ background: COMPARE }} />
              <span className="text-ui-fg-subtle">{formatBucket(compare[hover].key, interval)}</span>
              <span className="ml-auto pl-3 font-semibold tabular-nums text-ui-fg-base">{fmt(cmp[hover])}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-y-1.5 border-t border-ui-border-base pt-3 text-xs">
        <div className="flex items-center gap-x-2">
          <span className="size-2.5 rounded-sm" style={{ background: ACCENT }} />
          <span className="flex-1 text-ui-fg-subtle">{curLabel}</span>
          <span className="font-semibold tabular-nums text-ui-fg-base">{fmt(cur.reduce((a, b) => a + b, 0))}</span>
        </div>
        {cmp && cmpLabel ? (
          <div className="flex items-center gap-x-2">
            <span className="size-2.5 rounded-sm" style={{ background: COMPARE }} />
            <span className="flex-1 text-ui-fg-subtle">{cmpLabel}</span>
            <span className="font-semibold tabular-nums text-ui-fg-base">{fmt(cmp.reduce((a, b) => a + b, 0))}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── toplista tábla ────────────────────────────────────────────────────────
const Leaderboard = ({
  rows,
  nameHeader,
  currency,
  coupon,
}: {
  rows: LeaderRow[]
  nameHeader: string
  currency: string
  coupon?: boolean
}) =>
  rows.length === 0 ? (
    <Text size="xsmall" className="text-ui-fg-subtle">{T.empty}</Text>
  ) : (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-ui-fg-subtle">
          <th className="pb-2 font-medium">{nameHeader}</th>
          <th className="pb-2 text-right font-medium">{coupon ? T.colOrders : T.colItems}</th>
          <th className="pb-2 text-right font-medium">{coupon ? T.colDiscount : T.colNet}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-ui-border-base">
            <td className="max-w-0 truncate py-2 pr-3 text-ui-fg-interactive">{r.label}</td>
            <td className="py-2 text-right tabular-nums text-ui-fg-base">{formatNumber(coupon ? r.orders : r.quantity)}</td>
            <td className="py-2 text-right tabular-nums text-ui-fg-base">{formatMoney(r.net, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

// ── oldal ─────────────────────────────────────────────────────────────────
const AnalyticsPage = () => {
  const today = toIsoDate(new Date())
  const [selection, setSelection] = useState<Selection>({
    preset: "month",
    customFrom: today,
    customTo: today,
    compare: "previous_year",
  })
  const [intervalChoice, setIntervalChoice] = useState<Interval | null>(null)
  const [chartKind, setChartKind] = useState<"line" | "bar">("line")
  const [metric, setMetric] = useState<SeriesMetric>("net")
  const [currency, setCurrency] = useState<string>("")
  const [report, setReport] = useState<Report | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const range = useMemo(() => resolveRange(selection), [selection])
  const cmp = useMemo(() => compareRange(range, selection.preset, selection.compare), [range, selection])
  const interval = intervalChoice ?? defaultIntervalFor(range)

  // Sima fetch + useState, nem react-query: a Medusa admin nem osztja meg a
  // saját QueryClient-jét a bővítmény-route-okkal ("No QueryClient set").
  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      interval,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Budapest",
    })
    if (cmp) {
      params.set("compare_from", cmp.from.toISOString())
      params.set("compare_to", cmp.to.toISOString())
    }
    if (currency) params.set("currency", currency)
    setIsLoading(true)
    fetchReport(params)
      .then((r) => {
        if (!cancelled) setReport(r)
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(T.title, { description: err instanceof Error ? err.message : String(err) })
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range, cmp, interval, currency])

  const cur = report?.current
  const prev = report?.compare ?? null
  const cc = report?.currency ?? "huf"
  const curLabel = `${T.presets[selection.preset]} (${formatRange(range.from, range.to)})`
  const cmpLabel = cmp ? `${T.compare[selection.compare]} (${formatRange(cmp.from, cmp.to)})` : null
  const chartable: SeriesMetric[] = ["gross", "net", "orders", "items_sold"]

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex items-center gap-x-2">
        <ChartBar className="text-ui-fg-subtle" />
        <Heading level="h1">{T.title}</Heading>
        {isLoading ? <Text size="xsmall" className="ml-2 text-ui-fg-muted">{T.loading}</Text> : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateRangePicker value={selection} onApply={(s) => {
          setSelection(s)
          setIntervalChoice(null)
        }} />
        <div className="flex flex-wrap items-center gap-3">
          {report && report.currencies.length > 1 ? (
            <label className="flex items-center gap-x-2 text-xs text-ui-fg-subtle">
              {T.currency}
              <select
                value={cc}
                onChange={(e) => setCurrency(e.target.value)}
                className="rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-xs text-ui-fg-base"
              >
                {report.currencies.map((c) => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      {cur ? (
        <>
          <SectionTitle>{T.performance}</SectionTitle>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ui-border-base bg-ui-border-base md:grid-cols-4">
            {KPI_ORDER.map((k) => (
              <KpiCard
                key={k}
                label={T.metrics[k]}
                value={formatMetric(k, cur.totals[k], cc)}
                delta={prev ? pctDelta(cur.totals[k], prev.totals[k]) : null}
                invert={k === "discount"}
                active={k === metric}
                onClick={chartable.includes(k as SeriesMetric) ? () => setMetric(k as SeriesMetric) : undefined}
              />
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>{T.charts}</SectionTitle>
            <div className="flex items-center gap-3">
              <select
                value={interval}
                onChange={(e) => setIntervalChoice(e.target.value as Interval)}
                className="rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-xs text-ui-fg-base"
                aria-label={T.interval}
              >
                {(Object.keys(T.intervals) as Interval[]).map((i) => (
                  <option key={i} value={i}>{T.intervals[i]}</option>
                ))}
              </select>
              <Segmented<"line" | "bar">
                options={[["line", T.line], ["bar", T.bar]]}
                value={chartKind}
                onChange={setChartKind}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Card title={T.metrics[metric]}>
              <TimeChart
                current={cur.series}
                compare={prev?.series ?? null}
                interval={report!.interval}
                metric={metric}
                currency={cc}
                kind={chartKind}
                curLabel={curLabel}
                cmpLabel={cmpLabel}
              />
            </Card>
            <Card title={T.metrics[metric === "orders" ? "items_sold" : "orders"]}>
              <TimeChart
                current={cur.series}
                compare={prev?.series ?? null}
                interval={report!.interval}
                metric={metric === "orders" ? "items_sold" : "orders"}
                currency={cc}
                kind={chartKind}
                curLabel={curLabel}
                cmpLabel={cmpLabel}
              />
            </Card>
          </div>

          <SectionTitle>{T.leaderboards}</SectionTitle>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Card title={T.topCategories}>
              <Leaderboard rows={cur.top_categories} nameHeader={T.colCategory} currency={cc} />
            </Card>
            <Card title={T.topProducts}>
              <Leaderboard rows={cur.top_products} nameHeader={T.colProduct} currency={cc} />
            </Card>
            <Card title={T.topCoupons}>
              <Leaderboard rows={cur.top_coupons} nameHeader={T.colCoupon} currency={cc} coupon />
            </Card>
          </div>

          <Text size="xsmall" className="text-ui-fg-muted">{T.footnote}</Text>
        </>
      ) : null}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Analitika",
  icon: ChartBar,
})

export default AnalyticsPage
