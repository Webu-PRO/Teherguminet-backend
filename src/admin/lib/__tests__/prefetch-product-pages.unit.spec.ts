import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { subscribeProductPagePrefetch } from "../prefetch-product-pages"

const fields = "id,title,variants.id"
const params = { offset: 20, limit: 20, fields, tag_id: ["tag_tomket"], q: "winter", order: "-title", is_giftcard: false }
const key = (query: Record<string, unknown>) => ["products", "list", { query }]
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("product page prefetch", () => {
  let client: QueryClient
  let stop: () => void
  let unmount: () => void
  let list: jest.Mock

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 90_000 } } })
    list = jest.fn().mockResolvedValue({ products: [], count: 65 })
    stop = subscribeProductPagePrefetch(client, list)
    unmount = () => {}
  })
  afterEach(() => { unmount(); stop(); client.clear() })

  async function mount(query = params, count = 65) {
    const observer = new QueryObserver(client, {
      queryKey: key(query),
      queryFn: async () => ({ products: [], count }),
    })
    unmount = observer.subscribe(() => {})
    await tick()
    await tick()
    return observer
  }

  it("prefetches only both neighbors, preserving filters, sorting and fields", async () => {
    await mount()
    expect(list.mock.calls.map(([query]) => query)).toEqual([
      { ...params, offset: 0 }, { ...params, offset: 40 },
    ])
    expect(client.getQueryData(key({ ...params, offset: 40 }))).toEqual({ products: [], count: 65 })
    await tick()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it.each([[0, 65, [20]], [60, 65, [40]], [0, 0, []], [0, 20, []]])(
    "bounds offset %i with count %i", async (offset, count, expected) => {
      await mount({ ...params, offset }, count)
      expect(list.mock.calls.map(([query]) => query.offset)).toEqual(expected)
    }
  )

  it("ignores search suggestions and inactive queries", async () => {
    await client.fetchQuery({ queryKey: key(params), queryFn: async () => ({ count: 65 }) })
    await mount({ limit: 3, q: "", fields } as typeof params)
    expect(list).not.toHaveBeenCalled()
  })

  it("reuses fresh cache and refreshes neighbors after list invalidation", async () => {
    await client.prefetchQuery({ queryKey: key({ ...params, offset: 40 }), queryFn: () => list({ ...params, offset: 40 }) })
    list.mockClear()
    const observer = await mount()
    expect(list).toHaveBeenCalledTimes(1)
    list.mockClear()
    await observer.refetch()
    await tick()
    expect(list).not.toHaveBeenCalled()
    await client.invalidateQueries({ queryKey: ["products", "list"] })
    await tick()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it("works when the active page was loaded before the widget", async () => {
    stop()
    await mount()
    expect(list).not.toHaveBeenCalled()
    stop = subscribeProductPagePrefetch(client, list)
    await tick()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it("does not replace active data when a speculative request fails", async () => {
    list.mockRejectedValue(new Error("offline"))
    await mount()
    expect(client.getQueryState(key(params))?.status).toBe("success")
    expect(list).toHaveBeenCalledTimes(2)
  })

  it("unsubscribes on unmount", async () => {
    stop()
    await mount()
    expect(list).not.toHaveBeenCalled()
  })
})
