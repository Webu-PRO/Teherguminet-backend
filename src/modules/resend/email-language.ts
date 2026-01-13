export type LanguageCode = "hu" | "sk"

type LanguageHints = {
  locale?: unknown
  language?: unknown
  lang?: unknown
  countryCode?: unknown
  currencyCode?: unknown
}

type AddressCountry = {
  country_code?: string | null
  [key: string]: unknown
} | null

type RegionCurrency = {
  currency_code?: string | null
} | null

type OrderLanguageSource = {
  metadata?: Record<string, unknown> | null
  shipping_address?: AddressCountry
  billing_address?: AddressCountry
  currency_code?: string | null
} | null

type CartLanguageSource = {
  metadata?: Record<string, unknown> | null
  shipping_address?: AddressCountry
  billing_address?: AddressCountry
  region?: RegionCurrency
  currency_code?: string | null
} | null

const asString = (value: unknown) =>
  typeof value === "string" ? value : undefined

const normalizeLanguageTag = (value?: string) => {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (
    normalized.startsWith("hu") ||
    normalized.includes("hungarian") ||
    normalized.includes("magyar")
  ) {
    return "hu" as const
  }

  if (
    normalized.startsWith("sk") ||
    normalized.includes("slovak") ||
    normalized.includes("slovencina")
  ) {
    return "sk" as const
  }

  return null
}

const normalizeCountryCode = (value?: string) => {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (normalized === "hu") {
    return "hu" as const
  }

  if (normalized === "sk") {
    return "sk" as const
  }

  return null
}

const normalizeCurrencyCode = (value?: string) => {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (normalized === "huf") {
    return "hu" as const
  }

  if (normalized === "eur") {
    return "sk" as const
  }

  return null
}

export const resolveLanguageFromHints = (
  hints: LanguageHints
): LanguageCode => {
  const fromLocale = normalizeLanguageTag(asString(hints.locale))
  if (fromLocale) {
    return fromLocale
  }

  const fromLanguage = normalizeLanguageTag(asString(hints.language))
  if (fromLanguage) {
    return fromLanguage
  }

  const fromLang = normalizeLanguageTag(asString(hints.lang))
  if (fromLang) {
    return fromLang
  }

  const fromCountry = normalizeCountryCode(asString(hints.countryCode))
  if (fromCountry) {
    return fromCountry
  }

  const fromCurrency = normalizeCurrencyCode(asString(hints.currencyCode))
  if (fromCurrency) {
    return fromCurrency
  }

  return "hu"
}

export const resolveLanguageFromOrder = (
  order: OrderLanguageSource
): LanguageCode => {
  const metadata = (order?.metadata ?? {}) as Record<string, unknown>

  return resolveLanguageFromHints({
    locale: metadata.locale,
    language: metadata.language,
    lang: metadata.lang,
    countryCode:
      order?.shipping_address?.country_code ??
      order?.billing_address?.country_code,
    currencyCode: order?.currency_code,
  })
}

export const resolveLanguageFromCart = (
  cart: CartLanguageSource
): LanguageCode => {
  const metadata = (cart?.metadata ?? {}) as Record<string, unknown>

  return resolveLanguageFromHints({
    locale: metadata.locale,
    language: metadata.language,
    lang: metadata.lang,
    countryCode:
      cart?.shipping_address?.country_code ??
      cart?.billing_address?.country_code,
    currencyCode: cart?.currency_code ?? cart?.region?.currency_code,
  })
}
