import { resolveTomketConfig } from "./tomket"

export type TomketConfig = NonNullable<
  ReturnType<typeof resolveTomketConfig>["config"]
>

/**
 * Tomket Dropship API v1.7.4, section 4.
 *
 * Every feed is semicolon-separated UTF-8 CSV with no header row. Columns are
 * positional and the spec guarantees new columns are only ever appended, so we
 * read by index and ignore anything past the documented tail.
 */
const FULL_FEED_COLUMNS = [
  "internal_id",
  "ean",
  "producer",
  "design",
  "width",
  "height",
  "diameter",
  "speed_index",
  "load_index",
  "weight_kg",
  "eu_label_legacy",
  "price_eur_net",
  "stock",
  "shipping_fee_eur_net",
  "image_url",
  "tire_type",
  "dot",
  "extra_load",
  "runflat",
  "rim_fringe_protector",
  "eu_label",
  "eprel",
  "gpsr",
] as const

export type TomketTireRow = {
  internalId: string
  ean?: string
  producer: string
  design: string
  width: string
  height: string
  diameter: string
  speedIndex: string
  loadIndex: string
  weightKg?: number
  priceEurNet: number
  stock: number
  shippingFeeEurNet: number
  imageUrl?: string
  tireType: string
  dot?: string
  extraLoad: boolean
  runflat: boolean
  rimFringeProtector: boolean
  /** Rolling resistance / wet grip / noise class / noise dB / snow / ice. */
  label: {
    rollingResistance?: string
    wetGrip?: string
    noiseClass?: string
    noiseValue?: string
    snowGrip: boolean
    iceGrip: boolean
  }
  eprel?: string
  gpsr?: string
}

export type TomketStockRow = {
  internalId: string
  priceEurNet: number
  stock: number
  shippingFeeEurNet: number
}

export type TomketParseResult<T> = {
  rows: T[]
  /** Lines that could not be parsed, capped so a broken feed cannot blow up logs. */
  skipped: Array<{ line: number; reason: string; raw: string }>
  skippedCount: number
}

const MAX_REPORTED_SKIPS = 25

/**
 * Tyre type codes, section 4.1. `vehicle` and `season` drive the tags we put on
 * the Medusa product so the catalogue stays filterable in admin and storefront.
 */
export const TOMKET_TIRE_TYPES: Record<
  string,
  { label: string; vehicle: string; season?: string }
> = {
  PS: { label: "Személy nyári", vehicle: "személy", season: "nyári" },
  PW: { label: "Személy téli", vehicle: "személy", season: "téli" },
  PA: { label: "Személy négyévszakos", vehicle: "személy", season: "négyévszakos" },
  TS: { label: "Teher nyári", vehicle: "teher", season: "nyári" },
  TW: { label: "Teher téli", vehicle: "teher", season: "téli" },
  TA: { label: "Teher négyévszakos", vehicle: "teher", season: "négyévszakos" },
  OS: { label: "Terep nyári", vehicle: "terep", season: "nyári" },
  OW: { label: "Terep téli", vehicle: "terep", season: "téli" },
  MB: { label: "Motor", vehicle: "motor" },
  RT: { label: "Verseny", vehicle: "verseny" },
  AG: { label: "Mezőgazdasági", vehicle: "mezőgazdasági" },
}

const trim = (value: string | undefined) => (value ?? "").trim()

const parseNumber = (value: string | undefined) => {
  const normalized = trim(value)
  if (!normalized) {
    return undefined
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseYesNo = (value: string | undefined) =>
  trim(value).toLowerCase() === "yes"

const parseLabel = (value: string | undefined) => {
  // New EU label, section 4.1: RR/WG/NC/NV/SG/IG e.g. "d/a/b/71/1/0".
  const parts = trim(value).split("/")

  return {
    rollingResistance: trim(parts[0]) || undefined,
    wetGrip: trim(parts[1]) || undefined,
    noiseClass: trim(parts[2]) || undefined,
    noiseValue: trim(parts[3]) || undefined,
    snowGrip: trim(parts[4]) === "1",
    iceGrip: trim(parts[5]) === "1",
  }
}

const splitLines = (text: string) =>
  text.split(/\r?\n/).filter((line) => line.trim().length > 0)

export const parseTomketFullFeed = (
  text: string
): TomketParseResult<TomketTireRow> => {
  const rows: TomketTireRow[] = []
  const skipped: TomketParseResult<TomketTireRow>["skipped"] = []
  let skippedCount = 0

  const reject = (line: number, reason: string, raw: string) => {
    skippedCount += 1
    if (skipped.length < MAX_REPORTED_SKIPS) {
      skipped.push({ line, reason, raw: raw.slice(0, 200) })
    }
  }

  splitLines(text).forEach((raw, index) => {
    const cells = raw.split(";")
    const at = (name: (typeof FULL_FEED_COLUMNS)[number]) =>
      cells[FULL_FEED_COLUMNS.indexOf(name)]

    const internalId = trim(at("internal_id"))
    if (!/^\d{1,7}$/.test(internalId)) {
      // Also filters a header row, should the feed ever grow one.
      reject(index + 1, "internal id is not numeric", raw)
      return
    }

    const priceEurNet = parseNumber(at("price_eur_net"))
    if (priceEurNet === undefined || priceEurNet <= 0) {
      reject(index + 1, "missing or non-positive price", raw)
      return
    }

    const producer = trim(at("producer"))
    const design = trim(at("design"))
    if (!producer || !design) {
      reject(index + 1, "missing producer or design", raw)
      return
    }

    rows.push({
      internalId,
      ean: trim(at("ean")) || undefined,
      producer,
      design,
      width: trim(at("width")),
      height: trim(at("height")),
      diameter: trim(at("diameter")),
      speedIndex: trim(at("speed_index")),
      loadIndex: trim(at("load_index")),
      weightKg: parseNumber(at("weight_kg")),
      priceEurNet,
      stock: parseNumber(at("stock")) ?? 0,
      shippingFeeEurNet: parseNumber(at("shipping_fee_eur_net")) ?? 0,
      imageUrl: trim(at("image_url")) || undefined,
      tireType: trim(at("tire_type")).toUpperCase(),
      dot: trim(at("dot")) || undefined,
      extraLoad: parseYesNo(at("extra_load")),
      runflat: parseYesNo(at("runflat")),
      rimFringeProtector: parseYesNo(at("rim_fringe_protector")),
      label: parseLabel(at("eu_label")),
      eprel: trim(at("eprel")) || undefined,
      gpsr: trim(at("gpsr")) || undefined,
    })
  })

  return { rows, skipped, skippedCount }
}

export const parseTomketStockFeed = (
  text: string
): TomketParseResult<TomketStockRow> => {
  const rows: TomketStockRow[] = []
  const skipped: TomketParseResult<TomketStockRow>["skipped"] = []
  let skippedCount = 0

  splitLines(text).forEach((raw, index) => {
    const [id, price, stock, shipping] = raw.split(";")
    const internalId = trim(id)
    const priceEurNet = parseNumber(price)

    if (!/^\d{1,7}$/.test(internalId) || priceEurNet === undefined) {
      skippedCount += 1
      if (skipped.length < MAX_REPORTED_SKIPS) {
        skipped.push({
          line: index + 1,
          reason: "missing internal id or price",
          raw: raw.slice(0, 200),
        })
      }
      return
    }

    rows.push({
      internalId,
      priceEurNet,
      stock: parseNumber(stock) ?? 0,
      shippingFeeEurNet: parseNumber(shipping) ?? 0,
    })
  })

  return { rows, skipped, skippedCount }
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, "")

export const resolveTomketCountry = () =>
  (process.env.TOMKET_COUNTRY || "hu").trim().toLowerCase()

const fetchTomketText = async (path: string, config: TomketConfig) => {
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}${path}`
  const authHeader = Buffer.from(
    `${config.username}:${config.password}`
  ).toString("base64")

  const controller = new AbortController()
  // The full feed is multi-megabyte; the order timeout is far too tight for it.
  const timeoutMs =
    Number(process.env.TOMKET_FEED_TIMEOUT_MS) || 120000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Basic ${authHeader}` },
      signal: controller.signal,
    })

    const text = await response.text()

    if (!response.ok) {
      throw new Error(
        `Tomket feed error (${response.status} ${response.statusText}) for ${path}`
      )
    }

    if (/^error\s+\d+/i.test(text.trim())) {
      throw new Error(
        `Tomket feed returned ${text.trim().split(/\r?\n/)[0]} for ${path}`
      )
    }

    return text
  } finally {
    clearTimeout(timeout)
  }
}

/** Section 4.1 — complete product information, refreshed every two hours. */
export const fetchTomketFullFeed = async (
  config: TomketConfig,
  country = resolveTomketCountry()
) => parseTomketFullFeed(await fetchTomketText(`/tires/${country}/full`, config))

/** Section 4.2 — stock and price only, refreshed every ten minutes. */
export const fetchTomketStockFeed = async (
  config: TomketConfig,
  country = resolveTomketCountry()
) =>
  parseTomketStockFeed(await fetchTomketText(`/tires/${country}/stock`, config))

/** Section 4.3 — live stock for a single tyre, for pre-order checks only. */
export const fetchTomketItem = async (
  internalId: string,
  config: TomketConfig,
  country = resolveTomketCountry()
) => {
  const { rows } = parseTomketStockFeed(
    await fetchTomketText(`/tires/${country}/item/${internalId}`, config)
  )

  return rows[0] ?? null
}
