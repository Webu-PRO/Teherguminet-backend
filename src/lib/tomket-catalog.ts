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
export type TomketPricingOverrides = {
  eurHufRate?: number
  /** From the admin settings (store metadata); env is the fallback. */
  marginPercentHuf?: number | null
  marginPercentEur?: number | null
  includeShipping?: boolean | null
  hufRounding?: number | null
}

export const resolveTomketPricingConfig = (
  overrides: TomketPricingOverrides = {}
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

  const marginPercentHuf =
    typeof overrides.marginPercentHuf === "number" &&
    overrides.marginPercentHuf >= 0
      ? overrides.marginPercentHuf
      : parseNonNegativeNumber(process.env.TOMKET_MARGIN_PERCENT)
  if (marginPercentHuf === undefined) {
    missing.push("TOMKET_MARGIN_PERCENT")
  }

  if (eurHufRate === undefined || marginPercentHuf === undefined) {
    return { missing }
  }

  const marginPercentEur =
    typeof overrides.marginPercentEur === "number" &&
    overrides.marginPercentEur >= 0
      ? overrides.marginPercentEur
      : (parseNonNegativeNumber(process.env.TOMKET_MARGIN_PERCENT_EUR) ??
        marginPercentHuf)

  const includeShipping =
    typeof overrides.includeShipping === "boolean"
      ? overrides.includeShipping
      : (process.env.TOMKET_INCLUDE_SHIPPING_IN_PRICE || "")
          .trim()
          .toLowerCase() === "true"

  const hufRounding =
    typeof overrides.hufRounding === "number" && overrides.hufRounding > 0
      ? overrides.hufRounding
      : (parsePositiveNumber(process.env.TOMKET_HUF_ROUNDING) ?? 10)

  return {
    missing,
    config: {
      eurHufRate,
      marginPercentHuf,
      marginPercentEur,
      includeShipping,
      hufRounding,
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

/** Storefront category per tyre type: "Személy nyári gumi" → szemely-nyari-gumi. */
export const buildTomketTypeCategory = (tireType: string) => {
  const info = TOMKET_TIRE_TYPES[tireType]
  const label = info?.label ?? tireType
  const name = `${label} gumi`
  return { name, handle: slugify(name), label }
}

const VEHICLE_NOTES: Record<string, string> = {
  személy:
    "Személyautókhoz és kisebb haszongépjárművekhez fejlesztett abroncs. A méret, a terhelési index és a sebességjel a jármű forgalmi engedélyében vagy a gyári adattáblán megadott értékekkel egyezzen; tengelyenként azonos mintázatú párokat javasolt szerelni.",
  teher:
    "Kis- és nagyhaszonjárművekhez, teherautókhoz készült abroncs. A terhelési indexet a tengelyterheléssel együtt kell értékelni, a mintázat pedig a tengelypozícióhoz (kormányzott, hajtott, pótkocsi) és a jellemző útvonalhoz igazodjon.",
  terep:
    "SUV, 4x4 és terepjáró felhasználásra tervezett abroncs, megerősített szerkezettel. Vegyes használatnál a burkolt és burkolatlan utak arányát is érdemes figyelembe venni a mintázat kiválasztásakor.",
  motor:
    "Motorkerékpár-abroncs. Első és hátsó kerékre eltérő méret és mintázat tartozhat, ezért szerelés előtt ellenőrizze a gyártó előírását és a felni szélességét.",
  verseny:
    "Sport- és versenycélú abroncs, amelyet elsősorban zárt pályás vagy sportos használatra fejlesztettek. Közúti használhatóságát a jelölések és a hatályos előírások alapján ellenőrizze.",
  mezőgazdasági:
    "Mezőgazdasági gépekhez és munkagépekhez való abroncs. A talajkímélés, a vonóerő és a megengedett terhelés a gép feladatától és a felni méretétől függ.",
}

const SEASON_NOTES: Record<string, string> = {
  nyári:
    "Nyári abroncs: 7 °C feletti hőmérsékleten adja a legjobb tapadást és a legrövidebb féktávot, száraz és nedves úton egyaránt.",
  téli:
    "Téli abroncs: 7 °C alatt, havas és latyakos úton is megőrzi a rugalmasságát és a tapadását. A téli használatra való alkalmasságot a 3PMSF (hópehely) jelölés igazolja.",
  négyévszakos:
    "Négyévszakos abroncs: egész évben használható kompromisszum a nyári és a téli abroncs között, mérsékelt téli körülményekre és városi használatra.",
}

const formatWeight = (row: TomketTireRow) =>
  row.weightKg !== undefined
    ? `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 1 }).format(
        row.weightKg
      )} kg`
    : ""

/**
 * Follows the existing catalogue's description style: a short intro, "- "
 * bullet facts, then plain paragraphs and a "Választási útmutató" section.
 * The storefront renders it with whitespace-pre-line.
 */
export const buildTomketDescription = (row: TomketTireRow) => {
  const typeInfo = TOMKET_TIRE_TYPES[row.tireType]
  const producer = row.producer.trim()
  const design = row.design.trim()
  const designation = buildTomketDesignation(row)
  const typeLabel = typeInfo?.label ?? row.tireType

  const facts: string[] = [
    `- méret: ${buildTomketSize(row)}`,
    `${row.loadIndex.trim()}${row.speedIndex.trim()}`.trim()
      ? `- terhelési index / sebességjel: ${row.loadIndex.trim()}${row.speedIndex.trim()}`
      : "",
    `- gyártó: ${producer}`,
    design ? `- mintázat: ${design}` : "",
    `- kategória: ${typeLabel}`,
  ]

  const labelParts = [
    formatLabelClass(row.label.rollingResistance) &&
      `gördülési ellenállás ${formatLabelClass(row.label.rollingResistance)}`,
    formatLabelClass(row.label.wetGrip) &&
      `nedves tapadás ${formatLabelClass(row.label.wetGrip)}`,
    row.label.noiseValue &&
      `zajszint ${row.label.noiseValue} dB${
        row.label.noiseClass ? ` (${row.label.noiseClass})` : ""
      }`,
  ].filter(Boolean)
  if (labelParts.length) {
    facts.push(`- EU címke: ${labelParts.join(", ")}`)
  }

  const features = [
    row.extraLoad && "Extra Load (XL)",
    row.runflat && "Runflat",
    row.rimFringeProtector && "felnivédő perem",
    row.label.snowGrip && "3PMSF hópehely jelölés",
    row.label.iceGrip && "jégtapadás jelölés",
  ].filter(Boolean)
  if (features.length) {
    facts.push(`- jellemzők: ${features.join(", ")}`)
  }

  const weight = formatWeight(row)
  if (weight) {
    facts.push(`- tömeg: ${weight}`)
  }
  if (row.ean) {
    facts.push(`- EAN: ${row.ean}`)
  }

  const paragraphs = [
    `${producer} ${design} ${designation} — ${typeLabel.toLowerCase()} gumiabroncs.`,
    facts.filter(Boolean).join("\n\n"),
    typeInfo?.vehicle ? VEHICLE_NOTES[typeInfo.vehicle] : "",
    typeInfo?.season ? SEASON_NOTES[typeInfo.season] : "",
    "Választási útmutató",
    `A ${designation} jelölés a termék pontos azonosítását segíti. Rendelés előtt hasonlítsa össze a teljes méretjelölést a jelenlegi abroncs oldalfalával és a jármű gyártói előírásával: a méretnek, a terhelési indexnek és a sebességjelnek egyeznie kell, vagy azoknál magasabbnak kell lennie.`,
    "Tengelyenként azonos mintázatú és azonos állapotú abroncsokat javasolt használni. A felszerelést megfelelő géppel rendelkező szakműhely végezze, a légnyomást a jármű terheléséhez kell beállítani. Átvételkor ellenőrizze a méretet és az oldalfali jelöléseket; eltérés esetén felszerelés előtt jelezze.",
    "A termék a beszállító raktárából, rendelésre érkezik. A készletadat naponta többször frissül; a feltüntetett darabszám a rendelés pillanatában elérhető mennyiséget mutatja.",
  ].filter(Boolean)

  return paragraphs.join("\n\n")
}

const truncate = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`

/** Same keys the hand-made catalogue uses (see existing products' metadata). */
export const buildTomketSeo = (row: TomketTireRow) => {
  const typeInfo = TOMKET_TIRE_TYPES[row.tireType]
  const typeLabel = (typeInfo?.label ?? row.tireType).toLowerCase()
  const producer = row.producer.trim()
  const title = buildTomketTitle(row)

  return {
    seo_title: truncate(`${title} ${producer} ${typeLabel} gumi | TehergumiNet`, 70),
    seo_description: truncate(
      `${producer} ${row.design.trim()} ${buildTomketDesignation(row)} ${typeLabel} gumiabroncs: méretadatok, EU címke, aktuális készlet és ár. Rendelés online, kiszállítás raktárról.`,
      160
    ),
  }
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
  /** "Személy nyári gumi" / szemely-nyari-gumi — the storefront category. */
  typeCategory: { name: string; handle: string; label: string }
  subtitle: string
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
      typeCategory: buildTomketTypeCategory(row.tireType),
      subtitle: `${row.producer.trim()} · ${
        TOMKET_TIRE_TYPES[row.tireType]?.label ?? row.tireType
      }`,
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
        ...buildTomketSeo(row),
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
