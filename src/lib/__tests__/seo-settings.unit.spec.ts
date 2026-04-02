import { describe, expect, it } from "@jest/globals"

import {
  DEFAULT_SEO_STRUCTURED_DATA,
  DEFAULT_SEO_VIEWPORT,
  SEO_SETTINGS_METADATA_KEY,
  getDefaultSeoSettings,
  normalizeSeoSettings,
  upsertSeoSettingsInStoreMetadata,
} from "../seo-settings"

describe("seo settings helpers", () => {
  it("returns defaults for missing input", () => {
    expect(normalizeSeoSettings(null)).toEqual(getDefaultSeoSettings())
  })

  it("normalizes malformed values and keeps valid values", () => {
    expect(
      normalizeSeoSettings({
        metaTitle: "  Demo SEO Title  ",
        metaDescription: "  Demo description  ",
        metaImageUrl: "https://example.com/meta.jpg",
        metaSocial: [
          { key: " og:type ", value: " product " },
          { key: " ", value: "skip" },
        ],
        keywords: "  tire, truck  ",
        metaRobots: "  index,follow  ",
        structuredData: "",
        viewport: "",
        canonicalUrl: "invalid-url",
      })
    ).toEqual({
      metaTitle: "Demo SEO Title",
      metaDescription: "Demo description",
      metaImageUrl: "https://example.com/meta.jpg",
      metaSocial: [{ key: "og:type", value: "product" }],
      keywords: "tire, truck",
      metaRobots: "index,follow",
      structuredData: DEFAULT_SEO_STRUCTURED_DATA,
      viewport: DEFAULT_SEO_VIEWPORT,
      canonicalUrl: "",
    })
  })

  it("upserts seo settings into metadata without dropping existing keys", () => {
    const seoSettings = normalizeSeoSettings({
      metaTitle: "Example",
      canonicalUrl: "https://example.com",
    })

    const nextMetadata = upsertSeoSettingsInStoreMetadata(
      {
        keep_me: true,
      },
      seoSettings
    )

    expect(nextMetadata).toEqual({
      keep_me: true,
      [SEO_SETTINGS_METADATA_KEY]: seoSettings,
    })
  })
})
