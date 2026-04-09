export type RegionCountry = {
  iso_2?: string | null
}

export type QueryRegion = {
  id: string
  countries?: RegionCountry[] | null
}

export type QueryPricePreference = {
  id: string
  attribute?: string | null
  value?: string | null
  is_tax_inclusive?: boolean | null
}

export type PricePreferenceCreateInput = {
  attribute: "region_id"
  value: string
  is_tax_inclusive: false
}

export type RegionNetPreferencePlan = {
  create: PricePreferenceCreateInput[]
  updateIds: string[]
}

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return ""
  }

  return value.trim()
}

export const parseCountryCodeList = (raw: string | undefined) => {
  const unique = new Set<string>()
  for (const chunk of normalizeText(raw).split(",")) {
    const normalized = normalizeText(chunk).toLowerCase()
    if (!normalized) {
      continue
    }
    unique.add(normalized)
  }
  return [...unique]
}

export const filterRegionsByCountryCodes = (
  regions: QueryRegion[],
  countryCodes: string[]
) => {
  if (!countryCodes.length) {
    return [] as QueryRegion[]
  }

  const lookup = new Set(countryCodes.map((code) => normalizeText(code).toLowerCase()))

  return regions.filter((region) => {
    const countries = Array.isArray(region.countries) ? region.countries : []
    return countries.some((country) => {
      const code = normalizeText(country?.iso_2).toLowerCase()
      return Boolean(code) && lookup.has(code)
    })
  })
}

export const buildRegionNetPreferencePlan = (input: {
  targetRegions: QueryRegion[]
  preferences: QueryPricePreference[]
}): RegionNetPreferencePlan => {
  const preferenceByRegionId = new Map<string, QueryPricePreference>()

  for (const preference of input.preferences) {
    if (normalizeText(preference.attribute) !== "region_id") {
      continue
    }

    const regionId = normalizeText(preference.value)
    if (!regionId || preferenceByRegionId.has(regionId)) {
      continue
    }

    preferenceByRegionId.set(regionId, preference)
  }

  const create: PricePreferenceCreateInput[] = []
  const updateIds: string[] = []

  for (const region of input.targetRegions) {
    const regionId = normalizeText(region.id)
    if (!regionId) {
      continue
    }

    const existingPreference = preferenceByRegionId.get(regionId)

    if (!existingPreference) {
      create.push({
        attribute: "region_id",
        value: regionId,
        is_tax_inclusive: false,
      })
      continue
    }

    if (existingPreference.is_tax_inclusive === true) {
      const preferenceId = normalizeText(existingPreference.id)
      if (preferenceId) {
        updateIds.push(preferenceId)
      }
    }
  }

  return {
    create,
    updateIds,
  }
}
