import type {
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /store/featured-index
 *
 * The light, price-free index the storefront ranks every "featured" listing
 * from: id, created_at, collection_id, tag values and public categories of
 * every published product in the publishable key's sales channels — the same
 * rows and visibility as /store/products?fields=id,created_at,tags.value,
 * categories.id,categories.name,categories.handle,collection_id, but in one
 * SQL query. Paging that through /store/products took ~8.7 s at best (the
 * tag/category joins make large pages superlinear; 600 per page cost
 * 4.7-10.5 s each), measured 2026-11-12 on the 3.6k catalogue.
 */

type FeaturedIndexRow = {
  id: string
  created_at: string
  collection_id: string | null
  tags: { value: string }[]
  categories: { id: string; name: string; handle: string }[]
}

const CACHE_MS = 60 * 1000
const cache = new Map<string, { at: number; rows: Promise<FeaturedIndexRow[]> }>()

const FEATURED_INDEX_SQL = `
  select
    p.id,
    p.created_at,
    p.collection_id,
    coalesce(
      (select json_agg(json_build_object('value', t.value))
         from product_tags pt
         join product_tag t on t.id = pt.product_tag_id and t.deleted_at is null
        where pt.product_id = p.id),
      '[]'::json
    ) as tags,
    coalesce(
      (select json_agg(json_build_object('id', c.id, 'name', c.name, 'handle', c.handle))
         from product_category_product pcp
         join product_category c
           on c.id = pcp.product_category_id
          and c.deleted_at is null
          and c.is_internal = false
        where pcp.product_id = p.id),
      '[]'::json
    ) as categories
  from product p
  where p.deleted_at is null
    and p.status = 'published'
    and exists (
      select 1 from product_sales_channel psc
       where psc.product_id = p.id
         and psc.deleted_at is null
         and psc.sales_channel_id = any(?)
    )
  order by p.created_at asc, p.id asc
`

export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  const salesChannelIds = [
    ...(req.publishable_key_context?.sales_channel_ids ?? []),
  ].sort()

  if (!salesChannelIds.length) {
    res.status(200).json({ products: [], count: 0 })
    return
  }

  const key = salesChannelIds.join(",")
  const cached = cache.get(key)
  let rows: Promise<FeaturedIndexRow[]>

  if (cached && Date.now() - cached.at < CACHE_MS) {
    rows = cached.rows
  } else {
    const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    rows = pg
      .raw(FEATURED_INDEX_SQL, [salesChannelIds])
      .then((result: { rows: FeaturedIndexRow[] }) => result.rows)
    cache.set(key, { at: Date.now(), rows })
    // A failed query must not be served from the cache.
    rows.catch(() => cache.delete(key))
  }

  const products = await rows
  res.status(200).json({ products, count: products.length })
}
