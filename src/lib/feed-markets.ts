export type FeedMarket = {
  id: string
  region_id: string
  region_name: string
  country_code: string
  country_name: string
  currency_code: string
  flag: string
  label: string
  legacy_market_key: string
}

type FeedMarketRecord = {
  id?: unknown
  region_id?: unknown
  region_name?: unknown
  country_code?: unknown
  country_name?: unknown
  currency_code?: unknown
  flag?: unknown
  label?: unknown
  legacy_market_key?: unknown
}

type RegionCountryLike = {
  iso_2?: string | null
  display_name?: string | null
  name?: string | null
} | null

type RegionLike = {
  id?: string | null
  name?: string | null
  currency_code?: string | null
  countries?: RegionCountryLike[] | null
} | null

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

const unique = <T>(items: T[]) => {
  return [...new Set(items)]
}

const toFlagEmoji = (countryCode: string) => {
  const letters = countryCode.toUpperCase()

  if (!/^[A-Z]{2}$/.test(letters)) {
    return "🌍"
  }

  const codePoints = [...letters].map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

export const toLegacyFeedMarketKey = (input: {
  country_code: string
  currency_code: string
}) => {
  return `${input.country_code.toLowerCase()}_${input.currency_code.toLowerCase()}`
}

export const deriveFeedMarketsFromRegions = (regions: RegionLike[]): FeedMarket[] => {
  const markets: FeedMarket[] = []
  const seen = new Set<string>()

  for (const region of regions) {
    const regionId = normalizeString(region?.id)
    const regionName = normalizeString(region?.name) ?? "Régió"
    const currencyCode = normalizeString(region?.currency_code)?.toLowerCase()

    if (!regionId || !currencyCode) {
      continue
    }

    const countries = Array.isArray(region?.countries) ? region?.countries : []

    for (const country of countries) {
      const countryCode = normalizeString(country?.iso_2)?.toLowerCase()

      if (!countryCode) {
        continue
      }

      const marketId = `${regionId}:${countryCode}`

      if (seen.has(marketId)) {
        continue
      }

      seen.add(marketId)

      const countryName =
        normalizeString(country?.display_name) ??
        normalizeString(country?.name) ??
        countryCode.toUpperCase()

      const label = `${countryCode.toUpperCase()} / ${currencyCode.toUpperCase()}`

      markets.push({
        id: marketId,
        region_id: regionId,
        region_name: regionName,
        country_code: countryCode,
        country_name: countryName,
        currency_code: currencyCode,
        flag: toFlagEmoji(countryCode),
        label,
        legacy_market_key: toLegacyFeedMarketKey({
          country_code: countryCode,
          currency_code: currencyCode,
        }),
      })
    }
  }

  return markets.sort((a, b) => {
    const pair = a.label.localeCompare(b.label)
    if (pair !== 0) {
      return pair
    }

    const region = a.region_name.localeCompare(b.region_name)
    if (region !== 0) {
      return region
    }

    return a.id.localeCompare(b.id)
  })
}

export const normalizeFeedMarkets = (value: unknown): FeedMarket[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const next: FeedMarket[] = []
  const seen = new Set<string>()

  for (const rawEntry of value) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      continue
    }

    const entry = rawEntry as FeedMarketRecord
    const id = normalizeString(entry.id)
    const regionId = normalizeString(entry.region_id)
    const regionName = normalizeString(entry.region_name)
    const countryCode = normalizeString(entry.country_code)?.toLowerCase()
    const countryName = normalizeString(entry.country_name)
    const currencyCode = normalizeString(entry.currency_code)?.toLowerCase()

    if (!id || !regionId || !regionName || !countryCode || !countryName || !currencyCode) {
      continue
    }

    if (seen.has(id)) {
      continue
    }

    seen.add(id)

    const label =
      normalizeString(entry.label) ??
      `${countryCode.toUpperCase()} / ${currencyCode.toUpperCase()}`

    const flag = normalizeString(entry.flag) ?? toFlagEmoji(countryCode)

    next.push({
      id,
      region_id: regionId,
      region_name: regionName,
      country_code: countryCode,
      country_name: countryName,
      currency_code: currencyCode,
      flag,
      label,
      legacy_market_key:
        normalizeString(entry.legacy_market_key) ??
        toLegacyFeedMarketKey({
          country_code: countryCode,
          currency_code: currencyCode,
        }),
    })
  }

  return next
}

export const getFeedStatusRegionKeys = (markets: Pick<FeedMarket, "region_id">[]) => {
  return unique(markets.map((market) => market.region_id))
}

export const getLegacyPairToRegionMap = (
  markets: Pick<FeedMarket, "legacy_market_key" | "region_id">[]
) => {
  const map: Record<string, string[]> = {}

  for (const market of markets) {
    const pair = market.legacy_market_key
    if (!map[pair]) {
      map[pair] = []
    }

    if (!map[pair].includes(market.region_id)) {
      map[pair].push(market.region_id)
    }
  }

  return map
}

export const isSupportedFeedPair = (
  markets: Pick<FeedMarket, "country_code" | "currency_code">[],
  input: {
    country_code: string
    currency_code: string
  }
) => {
  const countryCode = input.country_code.toLowerCase()
  const currencyCode = input.currency_code.toLowerCase()

  return markets.some(
    (market) =>
      market.country_code.toLowerCase() === countryCode &&
      market.currency_code.toLowerCase() === currencyCode
  )
}
