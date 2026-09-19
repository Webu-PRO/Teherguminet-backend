import type { TomketTireRow } from "./tomket-feed"
import { TOMKET_TIRE_TYPES } from "./tomket-feed"
import { buildTomketSku } from "./tomket"

export {
  TOMKET_SKU_PREFIX,
  buildTomketSku,
  parseTomketSku,
} from "./tomket"

export const TOMKET_SOURCE_TAG = "tomket-dropship"

export type TomketPricingConfig = {
  /** EUR -> HUF conversion applied to the net supplier price. */
  eurHufRate: number
  /** Markup on the net supplier price for the HUF (HU) region. */
  marginPercentHuf: number
  /** Markup for the EUR (SK) region; defaults to the HUF markup. */
  marginPercentEur: number
  /** Fold the per-piece Tomket shipping fee into the item price. */
  includeShipping: boolean
  /** Round HUF prices to this multiple, e.g. 10 Ft. */
  hufRounding: number
}

// Number("") is 0, so an unset variable would otherwise read as a valid zero.
const parseNumberEnv = (value: string | undefined) => {
  const normalized = (value ?? "").trim()
  if (!normalized) {
    return undefined
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parsePositiveNumber = (value: string | undefined) => {
  const parsed = parseNumberEnv(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

const parseNonNegativeNumber = (value: string | undefined) => {
  const parsed = parseNumberEnv(value)
  return parsed !== undefined && parsed >= 0 ? parsed : undefined
}

/**
 * Both the FX rate and the markup are required. Defaulting either one would
 * silently publish the supplier's cost price as our retail price.
 *
 * The rate normally comes from the daily ECB fetch (see tomket-fx.ts), passed
 * in as `overrides.eurHufRate`; TOMKET_EUR_HUF_RATE is the manual fallback.
 */
export const resolveTomketPricingConfig = (
  overrides: { eurHufRate?: number } = {}
): {
  config?: TomketPricingConfig
  missing: string[]
} => {
  const missing: string[] = []

  const eurHufRate =
    overrides.eurHufRate !== undefined && overrides.eurHufRate > 0
      ? overrides.eurHufRate
      : parsePositiveNumber(process.env.TOMKET_EUR_HUF_RATE)
  if (eurHufRate === undefined) {
    missing.push("TOMKET_EUR_HUF_RATE")
  }

  const marginPercentHuf = parseNonNegativeNumber(
    process.env.TOMKET_MARGIN_PERCENT
  )
  if (marginPercentHuf === undefined) {
    missing.push("TOMKET_MARGIN_PERCENT")
  }

  if (eurHufRate === undefined || marginPercentHuf === undefined) {
    return { missing }
  }

  return {
    missing,
    config: {
      eurHufRate,
      marginPercentHuf,
      marginPercentEur:
        parseNonNegativeNumber(process.env.TOMKET_MARGIN_PERCENT_EUR) ??
        marginPercentHuf,
      includeShipping:
        (process.env.TOMKET_INCLUDE_SHIPPING_IN_PRICE || "")
          .trim()
          .toLowerCase() === "true",
      hufRounding:
        parsePositiveNumber(process.env.TOMKET_HUF_ROUNDING) ?? 10,
    },
  }
}

export type TomketPrices = {
  /** Net HUF price for the HU region. */
  huf: number
  /** Net EUR price for the SK region. */
  eur: number
  /** What we paid, kept for margin reporting in admin. */
  costEurNet: number
  shippingEurNet: number
}

export const calculateTomketPrices = (
  row: Pick<TomketTireRow, "priceEurNet" | "shippingFeeEurNet">,
  config: TomketPricingConfig
): TomketPrices => {
  const base =
    row.priceEurNet + (config.includeShipping ? row.shippingFeeEurNet : 0)

  const huf =
    Math.round(
      (base * (1 + config.marginPercentHuf / 100) * config.eurHufRate) /
        config.hufRounding
    ) * config.hufRounding

  const eur =
    Math.round(base * (1 + config.marginPercentEur / 100) * 100) / 100

  return {
    huf,
    eur,
    costEurNet: row.priceEurNet,
    shippingEurNet: row.shippingFeeEurNet,
  }
}

/** "165/70R14" — height is omitted when the feed has none (some truck sizes). */
export const buildTomketSize = (row: TomketTireRow) => {
  const width = row.width.trim()
  const height = row.height.trim()
  const diameter = row.diameter.trim()

  if (!width || !diameter) {
    return ""
  }

  return height
    ? `${width}/${height}R${diameter}`
    : `${width}R${diameter}`
}

/** "165/70R14 81T" */
export const buildTomketDesignation = (row: TomketTireRow) => {
  const size = buildTomketSize(row)
  const load = `${row.loadIndex.trim()}${row.speedIndex.trim()}`.trim()
  return [size, load].filter(Boolean).join(" ")
}

/**
 * Matches the existing catalogue convention: the title carries the size and
 * pattern, the brand lives in the product type / category / tag.
 */
export const buildTomketTitle = (row: TomketTireRow) =>
  [buildTomketDesignation(row), row.design.trim()]
    .filter(Boolean)
    .join(" ")

export const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

const LABEL_CLASS_LABELS: Record<string, string> = {
  a: "A",
  b: "B",
  c: "C",
  d: "D",
  e: "E",
}

const formatLabelClass = (value?: string) =>
  value ? LABEL_CLASS_LABELS[value.toLowerCase()] ?? value.toUpperCase() : null

export const buildTomketDescription = (row: TomketTireRow) => {
  const typeInfo = TOMKET_TIRE_TYPES[row.tireType]
  const lines: string[] = []

  lines.push(
    `${row.producer} ${row.design} ${buildTomketDesignation(row)} gumiabroncs.`
  )

  if (typeInfo) {
    lines.push(`Kategória: ${typeInfo.label}.`)
  }

  const labelParts = [
    formatLabelClass(row.label.rollingResistance) &&
      `gördülési ellenállás ${formatLabelClass(row.label.rollingResistance)}`,
    formatLabelClass(row.label.wetGrip) &&
      `nedves tapadás ${formatLabelClass(row.label.wetGrip)}`,
    row.label.noiseValue && `zajszint ${row.label.noiseValue} dB`,
  ].filter(Boolean)

  if (labelParts.length) {
    lines.push(`EU címke: ${labelParts.join(", ")}.`)
  }

  const features = [
    row.extraLoad && "Extra Load (XL)",
    row.runflat && "Runflat",
    row.rimFringeProtector && "felnivédő perem",
    row.label.snowGrip && "3PMSF hó szimbólum",
    row.label.iceGrip && "jégtapadás jelölés",
  ].filter(Boolean)

  if (features.length) {
    lines.push(`Jellemzők: ${features.join(", ")}.`)
  }

  return lines.join(" ")
}

export const buildTomketVariantMetadata = (
  row: TomketTireRow,
  prices: TomketPrices
) => ({
  // Read back by subscribers/tomket-fulfillment-created.ts to place the
  // dropship order, so this key must stay stable.
  tomket_internal_id: row.internalId,
  tomket_producer: row.producer,
  tomket_design: row.design,
  tomket_type: row.tireType,
  tomket_size: buildTomketSize(row),
  tomket_load_index: row.loadIndex || null,
  tomket_speed_index: row.speedIndex || null,
  tomket_ean: row.ean ?? null,
  tomket_dot: row.dot ?? null,
  tomket_extra_load: row.extraLoad,
  tomket_runflat: row.runflat,
  tomket_rim_fringe_protector: row.rimFringeProtector,
  tomket_label_rolling_resistance: row.label.rollingResistance ?? null,
  tomket_label_wet_grip: row.label.wetGrip ?? null,
  tomket_label_noise_class: row.label.noiseClass ?? null,
  tomket_label_noise_value: row.label.noiseValue ?? null,
  tomket_label_snow_grip: row.label.snowGrip,
  tomket_label_ice_grip: row.label.iceGrip,
  tomket_eprel: row.eprel ?? null,
  tomket_gpsr: row.gpsr ?? null,
  tomket_cost_eur_net: prices.costEurNet,
  tomket_shipping_eur_net: prices.shippingEurNet,
  tomket_synced_at: new Date().toISOString(),
})

export type TomketProductDraft = {
  internalId: string
  sku: string
  handle: string
  title: string
  description: string
  producer: string
  producerHandle: string
  tireType: string
  tags: string[]
  /** Grams — the shop stores variant weight in grams (see lib/cart-weight.ts). */
  weightGrams?: number
  imageUrl?: string
  stock: number
  prices: TomketPrices
  variantMetadata: Record<string, unknown>
  productMetadata: Record<string, unknown>
}

export const buildTomketTags = (row: TomketTireRow) => {
  const typeInfo = TOMKET_TIRE_TYPES[row.tireType]

  return Array.from(
    new Set(
      [
        row.producer.trim(),
        typeInfo?.vehicle,
        typeInfo?.season,
        TOMKET_SOURCE_TAG,
      ].filter((value): value is string => Boolean(value))
    )
  )
}

/**
 * Maps feed rows to product drafts. Handles are derived from the title and the
 * brand to match the existing catalogue; on a collision we fall back to the
 * Tomket id so the result stays unique and stable across runs.
 */
export const mapTomketRowsToDrafts = (
  rows: TomketTireRow[],
  config: TomketPricingConfig
): { drafts: TomketProductDraft[]; skipped: Array<{ internalId: string; reason: string }> } => {
  const drafts: TomketProductDraft[] = []
  const skipped: Array<{ internalId: string; reason: string }> = []
  const usedHandles = new Set<string>()

  // Sort by numeric id so handle de-duplication is deterministic run to run.
  const ordered = [...rows].sort(
    (a, b) => Number(a.internalId) - Number(b.internalId)
  )

  for (const row of ordered) {
    const title = buildTomketTitle(row)
    if (!title || !buildTomketSize(row)) {
      skipped.push({
        internalId: row.internalId,
        reason: "incomplete size information",
      })
      continue
    }

    const producerHandle = slugify(row.producer)
    let handle = `${slugify(title)}-${producerHandle}`
    if (usedHandles.has(handle)) {
      handle = `${handle}-${row.internalId}`
    }
    usedHandles.add(handle)

    const prices = calculateTomketPrices(row, config)

    drafts.push({
      internalId: row.internalId,
      sku: buildTomketSku(row.internalId),
      handle,
      title,
      description: buildTomketDescription(row),
      producer: row.producer.trim(),
      producerHandle,
      tireType: row.tireType,
      tags: buildTomketTags(row),
      weightGrams:
        row.weightKg !== undefined
          ? Math.round(row.weightKg * 1000)
          : undefined,
      imageUrl: row.imageUrl,
      stock: row.stock,
      prices,
      variantMetadata: buildTomketVariantMetadata(row, prices),
      productMetadata: {
        tomket_internal_id: row.internalId,
        tomket_producer: row.producer.trim(),
        tomket_type: row.tireType,
        tomket_type_label:
          TOMKET_TIRE_TYPES[row.tireType]?.label ?? row.tireType,
        tomket_gpsr: row.gpsr ?? null,
        tomket_source: "dropship",
      },
    })
  }

  return { drafts, skipped }
}
