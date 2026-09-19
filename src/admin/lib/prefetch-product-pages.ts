import type { HttpTypes } from "@medusajs/types"
import type { Query, QueryClient } from "@tanstack/react-query"

/**
 * Medusa 2.13 uses ["products", "list", { query }] for its native table.
 * Reuse that cache instead of a second table, fetch interceptor or API cache.
 */
export function subscribeProductPagePrefetch(
  client: QueryClient,
  listProducts: (params: HttpTypes.AdminProductListParams) => Promise<HttpTypes.AdminProductListResponse>
) {
  const cache = client.getQueryCache()
  const prefetch = (query: Query) => {
    if (
      query.queryKey[0] !== "products" || query.queryKey[1] !== "list" ||
      query.getObserversCount() === 0 || query.state.status !== "success" ||
      query.state.isInvalidated || query.state.fetchStatus !== "idle"
    ) return

    const params = (query.queryKey[2] as { query?: HttpTypes.AdminProductListParams } | undefined)?.query
    const count = (query.state.data as HttpTypes.AdminProductListResponse).count
    const { offset, limit } = params ?? {}
    // Search suggestions have no offset; the route loader has no fields.
    if (
      !params?.fields || typeof offset !== "number" || typeof limit !== "number" ||
      !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit <= 0 ||
      !Number.isFinite(count)
    ) return

    for (const adjacent of [offset - limit, offset + limit]) {
      if (adjacent < 0 || adjacent >= count) continue
      const next = { ...params, offset: adjacent }
      void client.prefetchQuery({
        queryKey: ["products", "list", { query: next }],
        queryFn: () => listProducts(next),
        retry: false,
      })
    }
  }

  const unsubscribe = cache.subscribe((event) => {
    if (
      event.type === "observerAdded" ||
      (event.type === "updated" && event.action.type === "success")
    ) prefetch(event.query)
  })
  cache.findAll({ queryKey: ["products", "list"], type: "active" }).forEach(prefetch)
  return unsubscribe
}
