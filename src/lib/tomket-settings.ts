import type { MedusaContainer } from "@medusajs/types"

import { readStoreMetadata, writeStoreMetadata } from "./tomket-status"

/**
 * Operator-editable pricing knobs for the Tomket catalogue, kept in store
 * metadata so they can be changed from the admin page without a redeploy.
 * Every field is optional: a missing (null) field falls back to the matching
 * TOMKET_* environment variable, so the env keeps working as the default.
 *
 * The 15-minute stock sync re-prices the catalogue, so a change here reaches
 * the storefront within a quarter of an hour.
 */

export const TOMKET_SETTINGS_METADATA_KEY = "tomket_settings"

export type TomketSettings = {
  /** Markup on the net supplier price for the HUF region, percent. */
  marginPercentHuf: number | null
  /** Markup for the EUR region; null = same as HUF. */
  marginPercentEur: number | null
  /** Buffer on top of the ECB mid rate, percent. */
  eurHufMarkupPercent: number | null
  /** Fold the per-piece Tomket shipping fee into the item price. */
  includeShipping: boolean | null
  /** Round HUF prices to this multiple. */
  hufRounding: number | null
  updatedAt: string | null
}

export const EMPTY_TOMKET_SETTINGS: TomketSettings = {
  marginPercentHuf: null,
  marginPercentEur: null,
  eurHufMarkupPercent: null,
  includeShipping: null,
  hufRounding: null,
  updatedAt: null,
}

export type TomketSettingsSource = "admin" | "env" | "default" | "missing"

const LIMITS = {
  marginPercentHuf: { min: 0, max: 500 },
  marginPercentEur: { min: 0, max: 500 },
  eurHufMarkupPercent: { min: 0, max: 50 },
  hufRounding: { min: 1, max: 10000 },
} as const

const finiteOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null
  }
  const parsed = typeof value === "number" ? value : Number(String(value).trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

export class TomketSettingsValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TomketSettingsValidationError"
  }
}

/**
 * Turns an admin payload into a settings object. Empty strings and nulls mean
 * "use the env default"; anything else must be a number inside the limits.
 */
export const parseTomketSettingsInput = (
  input: Record<string, unknown>
): Omit<TomketSettings, "updatedAt"> => {
  const numeric = (key: keyof typeof LIMITS, label: string) => {
    const value = finiteOrNull(input[key])
    if (value === undefined) {
      throw new TomketSettingsValidationError(`${label}: szám kell.`)
    }
    if (value !== null) {
      const { min, max } = LIMITS[key]
      if (value < min || value > max) {
        throw new TomketSettingsValidationError(
          `${label}: ${min} és ${max} között kell lennie.`
        )
      }
    }
    return value
  }

  const includeShippingRaw = input.includeShipping
  const includeShipping =
    includeShippingRaw === null || includeShippingRaw === undefined
      ? null
      : typeof includeShippingRaw === "boolean"
        ? includeShippingRaw
        : String(includeShippingRaw).trim().toLowerCase() === "true"

  return {
    marginPercentHuf: numeric("marginPercentHuf", "Árrés (HUF)"),
    marginPercentEur: numeric("marginPercentEur", "Árrés (EUR)"),
    eurHufMarkupPercent: numeric("eurHufMarkupPercent", "Árfolyam felár"),
    includeShipping,
    hufRounding: numeric("hufRounding", "Kerekítés"),
  }
}

export const readTomketSettings = async (
  container: MedusaContainer
): Promise<TomketSettings> => {
  const stored = await readStoreMetadata(container, TOMKET_SETTINGS_METADATA_KEY)
  if (!stored || typeof stored !== "object") {
    return EMPTY_TOMKET_SETTINGS
  }

  const candidate = stored as Partial<TomketSettings>
  const num = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : null

  return {
    marginPercentHuf: num(candidate.marginPercentHuf),
    marginPercentEur: num(candidate.marginPercentEur),
    eurHufMarkupPercent: num(candidate.eurHufMarkupPercent),
    includeShipping:
      typeof candidate.includeShipping === "boolean"
        ? candidate.includeShipping
        : null,
    hufRounding: num(candidate.hufRounding),
    updatedAt:
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : null,
  }
}

export const writeTomketSettings = async (
  container: MedusaContainer,
  settings: Omit<TomketSettings, "updatedAt">
): Promise<TomketSettings> => {
  const next: TomketSettings = {
    ...settings,
    updatedAt: new Date().toISOString(),
  }
  await writeStoreMetadata(container, TOMKET_SETTINGS_METADATA_KEY, next)
  return next
}

const parseEnvNumber = (value: string | undefined) => {
  const normalized = (value ?? "").trim()
  if (!normalized) {
    return null
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export type ResolvedTomketSetting<T> = { value: T; source: TomketSettingsSource }

export type ResolvedTomketSettings = {
  marginPercentHuf: ResolvedTomketSetting<number | null>
  marginPercentEur: ResolvedTomketSetting<number | null>
  eurHufMarkupPercent: ResolvedTomketSetting<number>
  includeShipping: ResolvedTomketSetting<boolean>
  hufRounding: ResolvedTomketSetting<number>
}

/**
 * Effective values with their origin: the admin setting wins, then the env
 * variable, then the built-in default. The HUF margin has no default — it is
 * the one thing that must be set explicitly, or the importer refuses to run.
 */
export const resolveTomketSettings = (
  settings: TomketSettings
): ResolvedTomketSettings => {
  const pick = <T>(
    admin: T | null,
    env: T | null,
    fallback: T | null
  ): ResolvedTomketSetting<T | null> =>
    admin !== null
      ? { value: admin, source: "admin" }
      : env !== null
        ? { value: env, source: "env" }
        : fallback !== null
          ? { value: fallback, source: "default" }
          : { value: null, source: "missing" }

  const marginPercentHuf = pick(
    settings.marginPercentHuf,
    parseEnvNumber(process.env.TOMKET_MARGIN_PERCENT),
    null
  )

  const marginPercentEurRaw = pick(
    settings.marginPercentEur,
    parseEnvNumber(process.env.TOMKET_MARGIN_PERCENT_EUR),
    null
  )
  const marginPercentEur: ResolvedTomketSetting<number | null> =
    marginPercentEurRaw.value !== null
      ? marginPercentEurRaw
      : { value: marginPercentHuf.value, source: marginPercentHuf.source }

  const markup = pick(
    settings.eurHufMarkupPercent,
    parseEnvNumber(process.env.TOMKET_EUR_HUF_MARKUP_PERCENT),
    0
  )

  const envIncludeShipping = (process.env.TOMKET_INCLUDE_SHIPPING_IN_PRICE ?? "")
    .trim()
    .toLowerCase()
  const includeShipping = pick(
    settings.includeShipping,
    envIncludeShipping ? envIncludeShipping === "true" : null,
    false
  )

  const rounding = pick(
    settings.hufRounding,
    parseEnvNumber(process.env.TOMKET_HUF_ROUNDING),
    10
  )

  return {
    marginPercentHuf,
    marginPercentEur,
    eurHufMarkupPercent: {
      value: Math.max(0, markup.value ?? 0),
      source: markup.source,
    },
    includeShipping: {
      value: includeShipping.value ?? false,
      source: includeShipping.source,
    },
    hufRounding: {
      value: rounding.value && rounding.value > 0 ? rounding.value : 10,
      source: rounding.source,
    },
  }
}
