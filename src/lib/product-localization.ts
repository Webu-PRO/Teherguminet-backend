export const TITLE_HU_KEYS = ["title_hu"] as const
export const TITLE_SK_KEYS = ["title_sk"] as const
export const DESCRIPTION_HU_KEYS = [
  "description_hu",
  "description_hu_hu",
  "leiras_hu",
  "leiras_hu_hu",
] as const
export const DESCRIPTION_SK_KEYS = [
  "description_sk",
  "description_sk_sk",
  "leiras_sk",
  "leiras_sk_sk",
] as const

export type ProductLocalizationValues = {
  title_hu: string
  title_sk: string
  description_hu: string
  description_sk: string
}

export const getEmptyProductLocalizationValues = (): ProductLocalizationValues => ({
  title_hu: "",
  title_sk: "",
  description_hu: "",
  description_sk: "",
})

export const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return ""
  }

  return value.trim()
}

const readFirstLocalizedValue = (
  source: Record<string, unknown> | null | undefined,
  keys: readonly string[]
) => {
  if (!source || typeof source !== "object") {
    return ""
  }

  for (const key of keys) {
    const value = normalizeText(source[key])
    if (value) {
      return value
    }
  }

  return ""
}

export const extractLocalizationFromMetadata = (
  metadata: Record<string, unknown> | null | undefined
): ProductLocalizationValues => {
  return {
    title_hu: readFirstLocalizedValue(metadata, TITLE_HU_KEYS),
    title_sk: readFirstLocalizedValue(metadata, TITLE_SK_KEYS),
    description_hu: readFirstLocalizedValue(metadata, DESCRIPTION_HU_KEYS),
    description_sk: readFirstLocalizedValue(metadata, DESCRIPTION_SK_KEYS),
  }
}

export const normalizeProductLocalizationValues = (
  input: Partial<ProductLocalizationValues> | null | undefined
): ProductLocalizationValues => {
  return {
    title_hu: normalizeText(input?.title_hu),
    title_sk: normalizeText(input?.title_sk),
    description_hu: normalizeText(input?.description_hu),
    description_sk: normalizeText(input?.description_sk),
  }
}

