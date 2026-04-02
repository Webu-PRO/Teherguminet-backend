import { AdminUpdateSeoSettings } from "../middlewares"

describe("admin seo-settings middleware schema", () => {
  it("accepts valid payload", () => {
    const parsed = AdminUpdateSeoSettings.safeParse({
      metaTitle: "SEO title",
      metaDescription: "SEO description",
      metaImageUrl: "https://example.com/meta-image.jpg",
      metaSocial: [{ key: "og:type", value: "product" }],
      keywords: "truck, tire",
      metaRobots: "index,follow",
      structuredData: "{\"@context\":\"https://schema.org\"}",
      viewport: "width=device-width, initial-scale=1.0",
      canonicalUrl: "https://example.com/product/winter-tires",
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects invalid canonical URL", () => {
    const parsed = AdminUpdateSeoSettings.safeParse({
      canonicalUrl: "not-a-url",
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects invalid structured data JSON", () => {
    const parsed = AdminUpdateSeoSettings.safeParse({
      structuredData: "{invalid json}",
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects malformed meta social entries", () => {
    const parsed = AdminUpdateSeoSettings.safeParse({
      metaSocial: [{ key: "", value: "x" }],
    })

    expect(parsed.success).toBe(false)
  })
})
