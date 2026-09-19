import type { MedusaContainer } from "@medusajs/types"

import {
  resolveTomketPricingConfig,
  type TomketPricingConfig,
  type TomketPricingOverrides,
} from "./tomket-catalog"
import {
  readTomketSettings,
  resolveTomketSettings,
  type ResolvedTomketSettings,
} from "./tomket-settings"
import { readStoreMetadata, writeStoreMetadata } from "./tomket-status"

/**
 * EUR→HUF rate for Tomket pricing.
 *
 * Tomket quotes net EUR; the HU region sells in HUF. Instead of a hand-set
 * TOMKET_EUR_HUF_RATE, the rate is pulled daily from the ECB reference feed
 * (published every TARGET business day around 16:00 CET) and kept in store
 * metadata, so the 15-minute stock sync re-prices the catalogue with it.
 *
 * TOMKET_EUR_HUF_RATE, when set, still wins — it is the manual override.
 * TOMKET_EUR_HUF_MARKUP_PERCENT (default 0) pads the ECB mid rate: banks
 * sell EUR above the reference rate, so a small buffer keeps the margin real.
 */

export const TOMKET_FX_METADATA_KEY = "tomket_fx"

export const ECB_DAILY_RATES_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"

/** ECB skips weekends and TARGET holidays; a week old is still a real rate. */
export const TOMKET_FX_MAX_AGE_DAYS = 7

export type TomketFxRate = {
  /** HUF per 1 EUR, as published (no markup applied). */
  rate: number
  /** Reference date of the rate (YYYY-MM-DD), from the feed. */
  date: string
  source: "ecb"
  fetchedAt: string
}

export type TomketFxSource = "env" | "ecb"

const parseNumberEnv = (value: string | undefined) => {
  const normalized = (value ?? "").trim()
  if (!normalized) {
    return undefined
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Pulls the HUF rate and its reference date out of the ECB daily XML. */
export const parseEcbHufRate = (
  xml: string
): { rate: number; date: string } | null => {
  const date = /<Cube[^>]*\stime=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1]
  const rateText = /<Cube[^>]*\scurrency=['"]HUF['"][^>]*\srate=['"]([\d.]+)['"]/.exec(
    xml
  )?.[1]

  if (!date || !rateText) {
    return null
  }

  const rate = Number(rateText)
  return Number.isFinite(rate) && rate > 0 ? { rate, date } : null
}

export const fetchEcbEurHufRate = async (): Promise<TomketFxRate> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(ECB_DAILY_RATES_URL, {
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(
        `ECB árfolyam feed hiba (${response.status} ${response.statusText})`
      )
    }

    const parsed = parseEcbHufRate(await response.text())
    if (!parsed) {
      throw new Error("ECB árfolyam feed: nincs HUF sor a válaszban")
    }

    return { ...parsed, source: "ecb", fetchedAt: new Date().toISOString() }
  } finally {
    clearTimeout(timeout)
  }
}

export const readTomketFxRate = async (
  container: MedusaContainer
): Promise<TomketFxRate | null> => {
  const stored = await readStoreMetadata(container, TOMKET_FX_METADATA_KEY)
  if (!stored || typeof stored !== "object") {
    return null
  }

  const candidate = stored as Partial<TomketFxRate>
  if (
    typeof candidate.rate !== "number" ||
    !(candidate.rate > 0) ||
    typeof candidate.date !== "string"
  ) {
    return null
  }

  return {
    rate: candidate.rate,
    date: candidate.date,
    source: "ecb",
    fetchedAt: candidate.fetchedAt ?? "",
  }
}

export const writeTomketFxRate = (
  container: MedusaContainer,
  fx: TomketFxRate
) => writeStoreMetadata(container, TOMKET_FX_METADATA_KEY, fx)

/** Fetches today's ECB rate and persists it. Throws when the feed fails. */
export const refreshTomketFxRate = async (container: MedusaContainer) => {
  const fx = await fetchEcbEurHufRate()
  await writeTomketFxRate(container, fx)
  return fx
}

export const isTomketFxStale = (
  fx: TomketFxRate,
  now = new Date(),
  maxAgeDays = TOMKET_FX_MAX_AGE_DAYS
) => {
  const referenceMs = Date.parse(`${fx.date}T00:00:00Z`)
  if (!Number.isFinite(referenceMs)) {
    return true
  }
  return now.getTime() - referenceMs > maxAgeDays * 24 * 60 * 60 * 1000
}

export const resolveTomketFxMarkupPercent = () =>
  Math.max(0, parseNumberEnv(process.env.TOMKET_EUR_HUF_MARKUP_PERCENT) ?? 0)

/** Applies the optional markup and rounds to 2 decimals. */
export const applyTomketFxMarkup = (rate: number, markupPercent: number) =>
  Math.round(rate * (1 + markupPercent / 100) * 100) / 100

export type TomketPricingResolution = {
  config?: TomketPricingConfig
  missing: string[]
  fx: {
    source: TomketFxSource
    /** The rate that pricing actually uses (markup included for ECB). */
    rate: number
    date: string | null
    markupPercent: number
  } | null
  settings: ResolvedTomketSettings
}

/**
 * Pricing config with the FX rate resolved from the env override, then the
 * stored ECB rate, then a live ECB fetch (first run before the daily job).
 * A stored rate older than a week counts as missing rather than silently
 * pricing on stale data. Margin, markup, rounding and the shipping switch come
 * from the admin settings first, then the TOMKET_* env.
 */
export const resolveTomketPricing = async (
  container: MedusaContainer,
  options: { allowLiveFetch?: boolean } = {}
): Promise<TomketPricingResolution> => {
  const settings = resolveTomketSettings(await readTomketSettings(container))
  const overrides: TomketPricingOverrides = {
    marginPercentHuf: settings.marginPercentHuf.value,
    marginPercentEur: settings.marginPercentEur.value,
    includeShipping: settings.includeShipping.value,
    hufRounding: settings.hufRounding.value,
  }

  const envRate = parseNumberEnv(process.env.TOMKET_EUR_HUF_RATE)
  if (envRate !== undefined && envRate > 0) {
    const { config, missing } = resolveTomketPricingConfig({
      ...overrides,
      eurHufRate: envRate,
    })
    return {
      config,
      missing,
      fx: { source: "env", rate: envRate, date: null, markupPercent: 0 },
      settings,
    }
  }

  let fx = await readTomketFxRate(container)

  if ((!fx || isTomketFxStale(fx)) && options.allowLiveFetch !== false) {
    try {
      fx = await refreshTomketFxRate(container)
    } catch {
      // Keep whatever we had; the caller reports the missing rate below.
    }
  }

  if (!fx || isTomketFxStale(fx)) {
    const { missing } = resolveTomketPricingConfig({
      ...overrides,
      eurHufRate: undefined,
    })
    return {
      missing: [
        "TOMKET_EUR_HUF_RATE (ECB árfolyam nem elérhető vagy elavult)",
        ...missing.filter((key) => key !== "TOMKET_EUR_HUF_RATE"),
      ],
      fx: null,
      settings,
    }
  }

  const markupPercent = settings.eurHufMarkupPercent.value
  const rate = applyTomketFxMarkup(fx.rate, markupPercent)
  const { config, missing } = resolveTomketPricingConfig({
    ...overrides,
    eurHufRate: rate,
  })

  return {
    config,
    missing,
    fx: { source: "ecb", rate, date: fx.date, markupPercent },
    settings,
  }
}
