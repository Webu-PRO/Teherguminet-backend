export const SEO_SETTINGS_METADATA_KEY = "seo_settings"

export const DEFAULT_SEO_VIEWPORT = "width=device-width, initial-scale=1.0"
export const DEFAULT_SEO_STRUCTURED_DATA = "{}"

export type SeoSocialEntry = {
  key: string
  value: string
}

export type SeoSettings = {
  metaTitle: string
  metaDescription: string
  metaImageUrl: string
  metaSocial: SeoSocialEntry[]
  keywords: string
  metaRobots: string
  structuredData: string
  viewport: string
  canonicalUrl: string
}

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

const normalizeText = (value: unknown, maxLength: number): string => {
  if (typeof value !== "string") {
    return ""
  }

  return value.trim().slice(0, maxLength)
}

export const isValidAbsoluteHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export const isValidJsonString = (value: string): boolean => {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

const normalizeAbsoluteUrl = (value: unknown, maxLength: number): string => {
  const normalized = normalizeText(value, maxLength)
  if (!normalized) {
    return ""
  }

  if (!isValidAbsoluteHttpUrl(normalized)) {
    return ""
  }

  return normalized
}

const normalizeMetaSocial = (value: unknown): SeoSocialEntry[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const normalized: SeoSocialEntry[] = []
  for (const entry of value) {
    const record = toRecord(entry)
    const key = normalizeText(record.key, 120)
    const socialValue = normalizeText(record.value, 500)

    if (!key || !socialValue) {
      continue
    }

    normalized.push({
      key,
      value: socialValue,
    })
  }

  return normalized
}

export const getDefaultSeoSettings = (): SeoSettings => {
  return {
    metaTitle: "",
    metaDescription: "",
    metaImageUrl: "",
    metaSocial: [],
    keywords: "",
    metaRobots: "",
    structuredData: DEFAULT_SEO_STRUCTURED_DATA,
    viewport: DEFAULT_SEO_VIEWPORT,
    canonicalUrl: "",
  }
}

export const normalizeSeoSettings = (value: unknown): SeoSettings => {
  const source = toRecord(value)
  const defaults = getDefaultSeoSettings()
  const normalizedStructuredData = normalizeText(source.structuredData, 20000)
  const normalizedViewport = normalizeText(source.viewport, 120)

  return {
    metaTitle: normalizeText(source.metaTitle, 70),
    metaDescription: normalizeText(source.metaDescription, 500),
    metaImageUrl: normalizeAbsoluteUrl(source.metaImageUrl, 2048),
    metaSocial: normalizeMetaSocial(source.metaSocial),
    keywords: normalizeText(source.keywords, 1000),
    metaRobots: normalizeText(source.metaRobots, 255),
    structuredData: normalizedStructuredData || defaults.structuredData,
    viewport: normalizedViewport || defaults.viewport,
    canonicalUrl: normalizeAbsoluteUrl(source.canonicalUrl, 2048),
  }
}

export const upsertSeoSettingsInStoreMetadata = (
  metadata: unknown,
  seoSettings: SeoSettings
): Record<string, unknown> => {
  const metadataRecord = toRecord(metadata)

  return {
    ...metadataRecord,
    [SEO_SETTINGS_METADATA_KEY]: seoSettings,
  }
}
