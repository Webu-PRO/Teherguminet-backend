import {
  extractSizeTokens,
  transformProductDocument,
} from "../meilisearch-products"

describe("extractSizeTokens", () => {
  it("indexes a metric size as one separator-free digit token", () => {
    expect(extractSizeTokens("385/65R22.5-20PR SWS04")).toEqual([
      "38565225",
      "38565",
      "385",
      "65",
      "225",
    ])
  })

  it("accepts spaces, ZR and a decimal comma", () => {
    expect(extractSizeTokens("315/80 R 22,5")).toContain("31580225")
    expect(extractSizeTokens("295/60ZR22.5")).toContain("29560225")
  })

  it("indexes inch sizes", () => {
    expect(extractSizeTokens("12R22.5 Michelin XZY")).toContain("12225")
  })

  it("returns nothing for titles without a size", () => {
    expect(extractSizeTokens("Gumiszerelő kompresszor")).toEqual([])
  })
})

describe("transformProductDocument", () => {
  it("flattens the relations the storefront searches on", () => {
    const doc = transformProductDocument({
      id: "prod_1",
      title: "385/55R22.5-20PR SWS02",
      handle: "385-55r22-5",
      description: "<p>Teher&nbsp;gumi</p>",
      images: [{ url: "a.jpg" }, { url: "b.jpg" }],
      type: { value: "SUPERWAY" },
      categories: [{ name: "Teher nyári gumi", handle: "nyari" }],
      variants: [{ sku: "T0020" }],
      tags: [{ value: "SUPERWAY" }],
    })

    expect(doc).toMatchObject({
      brand: "SUPERWAY",
      description: "Teher gumi",
      images: ["a.jpg", "b.jpg"],
      skus: ["T0020"],
      category_handles: ["nyari"],
    })
    expect(doc.size_tokens).toContain("38555225")
  })
})
