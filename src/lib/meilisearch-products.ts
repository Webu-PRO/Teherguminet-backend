/**
 * Meilisearch product index for the storefront search (suggest dropdown and
 * the /store?q= listing). Registered from medusa-config.ts only when
 * MEILISEARCH_HOST and MEILISEARCH_API_KEY are set.
 *
 * Tyre sizes live in the product title ("385/65R22.5-20PR SWS04"). Shoppers
 * type them in every shape: "385/65 r22.5", "38565r22.5", "385 65 22,5". The
 * `size_tokens` field indexes one separator-free digit form per size
 * ("38565225") that the storefront derives from the query the same way, so
 * every spelling lands on the same token.
 */

const stripHtml = (value: unknown) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 600)
    : null

const pluck = (list: unknown, key: string) =>
  Array.isArray(list)
    ? list
        .map((entry) => (entry as Record<string, unknown> | null)?.[key])
        .filter((value): value is string => typeof value === "string" && !!value)
    : []

// 385/65R22.5, 315/80 R 22,5, 295/60ZR22.5
const METRIC_SIZE = /(\d{3})\s*\/\s*(\d{2,3})\s*-?\s*Z?R?\s*(\d{2}(?:[.,]\d)?)/gi
// 12R22.5, 11 R 22,5
const INCH_SIZE = /(?<![/\d])(\d{2})\s*R\s*(\d{2}(?:[.,]\d)?)/gi

const digits = (value: string) => value.replace(/\D/g, "")

/**
 * Separator-free digit forms of every tyre size in `text`: the full size,
 * width+profile, and each part alone. The storefront rewrites sizes in the
 * query to the same forms (see its lib/search/meilisearch.ts), so
 * "315/80 michelin" and "31580r225" both hit "31580".
 *
 * @example
 * extractSizeTokens("385/65R22.5-20PR SWS04")
 * // ["38565225", "38565", "385", "65", "225"]
 */
export const extractSizeTokens = (text: string): string[] => {
  const tokens = new Set<string>()

  for (const match of text.matchAll(METRIC_SIZE)) {
    const [, width, profile, rim] = match
    tokens.add(`${width}${profile}${digits(rim)}`)
    tokens.add(`${width}${profile}`)
    tokens.add(width)
    tokens.add(profile)
    tokens.add(digits(rim))
  }

  for (const match of text.matchAll(INCH_SIZE)) {
    const [, width, rim] = match
    tokens.add(`${width}${digits(rim)}`)
    tokens.add(width)
    tokens.add(digits(rim))
  }

  return [...tokens]
}

type ProductLike = Record<string, any>

export const transformProductDocument = (product: ProductLike) => {
  const title = typeof product.title === "string" ? product.title : ""
  const skus = pluck(product.variants, "sku")

  return {
    id: product.id,
    title,
    subtitle: product.subtitle ?? null,
    handle: product.handle,
    thumbnail: product.thumbnail ?? null,
    images: pluck(product.images, "url").slice(0, 3),
    description: stripHtml(product.description),
    created_at: product.created_at,
    size_tokens: extractSizeTokens(`${title} ${product.subtitle ?? ""}`),
    brand: product.type?.value ?? product.collection?.title ?? null,
    collection_title: product.collection?.title ?? null,
    collection_handle: product.collection?.handle ?? null,
    category_names: pluck(product.categories, "name"),
    category_handles: pluck(product.categories, "handle"),
    tags: pluck(product.tags, "value"),
    skus,
  }
}

export const buildMeilisearchPlugin = (
  host: string,
  apiKey: string,
  productsIndex: string
) => ({
  resolve: "@rokmohar/medusa-plugin-meilisearch",
  options: {
    config: { host, apiKey },
    settings: {
      [productsIndex]: {
        type: "products",
        enabled: true,
        primaryKey: "id",
        fields: [
          "id",
          "title",
          "subtitle",
          "description",
          "handle",
          "thumbnail",
          "created_at",
          "images.url",
          "type.value",
          "categories.name",
          "categories.handle",
          "collection.title",
          "collection.handle",
          "tags.value",
          "variants.sku",
        ],
        indexSettings: {
          searchableAttributes: [
            "title",
            "size_tokens",
            "skus",
            "brand",
            "collection_title",
            "category_names",
            "tags",
            "subtitle",
            "description",
          ],
          displayedAttributes: [
            "id",
            "title",
            "subtitle",
            "handle",
            "thumbnail",
            "images",
            "description",
            "brand",
          ],
          filterableAttributes: [
            "id",
            "brand",
            "category_handles",
            "collection_handle",
          ],
          sortableAttributes: ["created_at"],
          // "315" must never typo-match "325": sizes are exact.
          typoTolerance: { disableOnNumbers: true },
          stopWords: ["a", "az", "egy", "és", "vagy", "de", "hogy"],
        },
        transformer: transformProductDocument,
      },
    },
  },
})
