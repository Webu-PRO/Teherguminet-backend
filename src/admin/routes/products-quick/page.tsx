import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  EllipsisHorizontal,
  MinusMini,
  PencilSquare,
  PlusMini,
  Trash,
} from "@medusajs/icons"
import { Button, Input, Text, toast } from "@medusajs/ui"

type InventoryLevel = {
  id?: string
  location_id?: string | null
  stocked_quantity?: number | null
  reserved_quantity?: number | null
}

type ProductCollection = {
  id: string
  title?: string | null
}

type ProductCategory = {
  id: string
  name?: string | null
}

type ProductVariantPrice = {
  id?: string
  currency_code?: string | null
  amount?: number | null
  min_quantity?: number | null
  max_quantity?: number | null
  rules?: Record<string, string> | null
}

type ProductVariant = {
  id: string
  sku?: string | null
  height?: number | null
  width?: number | null
  length?: number | null
  weight?: number | null
  prices?: ProductVariantPrice[] | null
}

type InventoryItemSummary = {
  id: string
  sku?: string | null
  height?: number | null
  width?: number | null
  length?: number | null
  weight?: number | null
  location_levels?: InventoryLevel[] | null
}

type ProductRow = {
  id: string
  title?: string | null
  status?: string | null
  collection_id?: string | null
  collection?: ProductCollection | null
  categories?: ProductCategory[] | null
  variants?: ProductVariant[] | null
}

type ProductListResponse = {
  products?: ProductRow[]
  count?: number
}

type ProductResponse = {
  product?: ProductRow
  message?: string
}

type CollectionListResponse = {
  collections?: ProductCollection[]
  message?: string
}

type CategoryListResponse = {
  product_categories?: ProductCategory[]
  message?: string
}

type InventoryItemListResponse = {
  inventory_items?: InventoryItemSummary[]
  message?: string
}

type InventoryItemResponse = {
  inventory_item?: InventoryItemSummary
  message?: string
}

type StockLocation = {
  id: string
  name?: string | null
}

type StockLocationListResponse = {
  stock_locations?: StockLocation[]
  message?: string
}

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const
const PRODUCT_FIELDS =
  "id,title,status,collection_id,*collection,*categories,*variants,*variants.prices,variants.prices.price_rules.value,variants.prices.price_rules.attribute"

type EditableField =
  | "title"
  | "height"
  | "width"
  | "length"
  | "weight"
  | "priceEur"
  | "priceHuf"
type DimensionField = Exclude<
  EditableField,
  "title" | "priceEur" | "priceHuf"
>

type PriceCurrency = "EUR" | "HUF"

const STATUS_OPTIONS = [
  { value: "published", label: "Közzétéve" },
  { value: "draft", label: "Nem közzétett" },
  { value: "proposed", label: "Javasolt" },
  { value: "rejected", label: "Elutasított" },
] as const

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return ""
  }

  return value.trim()
}

const normalizeNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return 0
}

const readLocationLevels = (item: InventoryItemSummary | null | undefined) => {
  return Array.isArray(item?.location_levels) ? item.location_levels : []
}

const readLevelForLocation = (
  item: InventoryItemSummary,
  locationId: string
) => {
  const normalizedLocationId = normalizeText(locationId)
  if (!normalizedLocationId) {
    return null
  }

  const match = readLocationLevels(item).find((level) => {
    return normalizeText(level.location_id) === normalizedLocationId
  })

  return match ?? null
}

const upsertLocationLevelStock = (
  item: InventoryItemSummary,
  locationId: string,
  stockedQuantity: number
) => {
  const levels = readLocationLevels(item)
  const normalizedLocationId = normalizeText(locationId)

  if (!normalizedLocationId) {
    return item
  }

  const levelExists = levels.some((level) => {
    return normalizeText(level.location_id) === normalizedLocationId
  })

  const nextLevels = levelExists
    ? levels.map((level) => {
        if (normalizeText(level.location_id) !== normalizedLocationId) {
          return level
        }

        return {
          ...level,
          location_id: normalizedLocationId,
          stocked_quantity: stockedQuantity,
        }
      })
    : [
        ...levels,
        {
          location_id: normalizedLocationId,
          stocked_quantity: stockedQuantity,
          reserved_quantity: 0,
        },
      ]

  return {
    ...item,
    location_levels: nextLevels,
  }
}

const resolveStatusLabel = (status: unknown) => {
  const normalizedStatus = normalizeText(status).toLowerCase()
  const option = STATUS_OPTIONS.find((entry) => {
    return entry.value === normalizedStatus
  })
  return option?.label || normalizedStatus || "-"
}

const resolvePrimaryCategory = (product: ProductRow) => {
  if (!Array.isArray(product.categories) || !product.categories.length) {
    return null
  }
  return product.categories[0] ?? null
}

const resolvePrimaryVariant = (product: ProductRow) => {
  if (!Array.isArray(product.variants) || !product.variants.length) {
    return null
  }
  return product.variants[0] ?? null
}

const resolveVariantPriceByCurrency = (
  variant: ProductVariant | null | undefined,
  currencyCode: PriceCurrency
) => {
  if (!variant || !Array.isArray(variant.prices) || !variant.prices.length) {
    return null
  }

  const normalizedCurrency = currencyCode.toLowerCase()
  const exactMatch = variant.prices.find((price) => {
    const code = normalizeText(price?.currency_code).toLowerCase()
    return (
      code === normalizedCurrency &&
      typeof price?.amount === "number" &&
      Number.isFinite(price.amount)
    )
  })

  return exactMatch ?? null
}

const resolvePriceAmount = (
  price: ProductVariantPrice | null | undefined
) => {
  const amount = price?.amount
  return typeof amount === "number" && Number.isFinite(amount)
    ? amount
    : null
}

const matchesSearch = (product: ProductRow, query: string) => {
  const normalizedQuery = normalizeText(query).toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  const variant = resolvePrimaryVariant(product)
  const terms = [
    normalizeText(product.title),
    normalizeText(product.collection?.title),
    normalizeText(resolvePrimaryCategory(product)?.name),
    normalizeText(variant?.sku),
    normalizeText(product.id),
  ]

  return terms.some((term) => {
    return term.toLowerCase().includes(normalizedQuery)
  })
}

const ProductsQuickPage = () => {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [collections, setCollections] = useState<ProductCollection[]>(
    []
  )
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [stockLocations, setStockLocations] = useState<StockLocation[]>(
    []
  )
  const [defaultLocationId, setDefaultLocationId] = useState("")
  const [inventoryItemsBySku, setInventoryItemsBySku] = useState<
    Record<string, InventoryItemSummary>
  >({})
  const [searchInput, setSearchInput] = useState("")
  const [limit, setLimit] = useState(50)
  const [offset, setOffset] = useState(0)
  const [count, setCount] = useState(0)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [loadingLookups, setLoadingLookups] = useState(false)
  const [updatingProductId, setUpdatingProductId] = useState<
    string | null
  >(null)
  const [editingCell, setEditingCell] = useState<{
    productId: string
    field: EditableField
  } | null>(null)
  const [editingValue, setEditingValue] = useState("")
  const [openActionsProductId, setOpenActionsProductId] = useState<
    string | null
  >(null)
  const [editingStockProductId, setEditingStockProductId] = useState<
    string | null
  >(null)
  const [editingStockValue, setEditingStockValue] = useState("")

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      return matchesSearch(product, searchInput)
    })
  }, [products, searchInput])

  const totalPages = useMemo(() => {
    if (count <= 0) {
      return 1
    }

    return Math.max(1, Math.ceil(count / limit))
  }, [count, limit])

  const currentPage = useMemo(() => {
    if (count <= 0) {
      return 1
    }

    return Math.floor(offset / limit) + 1
  }, [count, limit, offset])

  const resolveInventoryItemForProduct = useCallback(
    (product: ProductRow) => {
      const variant = resolvePrimaryVariant(product)
      const sku = normalizeText(variant?.sku).toLowerCase()
      if (!sku) {
        return null
      }

      return inventoryItemsBySku[sku] ?? null
    },
    [inventoryItemsBySku]
  )

  const resolveDimensionValue = useCallback(
    (product: ProductRow, field: DimensionField): number | null => {
      const variant = resolvePrimaryVariant(product)
      const variantValue = variant?.[field]
      const inventoryItem = resolveInventoryItemForProduct(product)
      const inventoryValue = inventoryItem?.[field]

      if (
        typeof inventoryValue === "number" &&
        Number.isFinite(inventoryValue) &&
        inventoryValue !== 0
      ) {
        return inventoryValue
      }

      if (
        typeof variantValue === "number" &&
        Number.isFinite(variantValue) &&
        variantValue !== 0
      ) {
        return variantValue
      }

      if (
        typeof inventoryValue === "number" &&
        Number.isFinite(inventoryValue)
      ) {
        return inventoryValue
      }

      if (typeof variantValue === "number" && Number.isFinite(variantValue)) {
        return variantValue
      }

      return null
    },
    [resolveInventoryItemForProduct]
  )

  const resolveActiveLocationId = useCallback(
    (inventoryItem: InventoryItemSummary | null) => {
      if (!inventoryItem) {
        return normalizeText(defaultLocationId)
      }

      const fromItem = normalizeText(
        readLocationLevels(inventoryItem)[0]?.location_id
      )
      if (fromItem) {
        return fromItem
      }

      return (
        normalizeText(defaultLocationId) ||
        normalizeText(stockLocations[0]?.id)
      )
    },
    [defaultLocationId, stockLocations]
  )

  const resolveStockValue = useCallback(
    (product: ProductRow): number | null => {
      const inventoryItem = resolveInventoryItemForProduct(product)
      if (!inventoryItem) {
        return null
      }

      const activeLocationId = resolveActiveLocationId(inventoryItem)
      if (activeLocationId) {
        return normalizeNumber(
          readLevelForLocation(inventoryItem, activeLocationId)
            ?.stocked_quantity
        )
      }

      return readLocationLevels(inventoryItem).reduce((sum, level) => {
        return sum + normalizeNumber(level.stocked_quantity)
      }, 0)
    },
    [resolveActiveLocationId, resolveInventoryItemForProduct]
  )

  const replaceProductRow = useCallback((nextProduct: ProductRow) => {
    setProducts((currentRows) => {
      return currentRows.map((row) => {
        if (row.id !== nextProduct.id) {
          return row
        }
        return nextProduct
      })
    })
  }, [])

  const fetchProductRow = useCallback(async (productId: string) => {
    const params = new URLSearchParams()
    params.set("fields", PRODUCT_FIELDS)

    let response = await fetch(
      `/admin/products/${encodeURIComponent(
        productId
      )}?${params.toString()}`,
      {
        credentials: "include",
      }
    )

    if (!response.ok) {
      response = await fetch(
        `/admin/products/${encodeURIComponent(productId)}`,
        {
          credentials: "include",
        }
      )
    }

    const payload = (await response
      .json()
      .catch(() => ({}))) as ProductResponse

    if (!response.ok || !payload.product) {
      throw new Error(payload.message || "Nem sikerült lekérni a terméket.")
    }

    return payload.product
  }, [])

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true)

    try {
      const params = new URLSearchParams()
      params.set("limit", String(limit))
      params.set("offset", String(offset))
      params.set("fields", PRODUCT_FIELDS)

      let response = await fetch(`/admin/products?${params.toString()}`, {
        credentials: "include",
      })

      if (!response.ok) {
        const fallbackParams = new URLSearchParams(params)
        fallbackParams.delete("fields")
        response = await fetch(
          `/admin/products?${fallbackParams.toString()}`,
          {
            credentials: "include",
          }
        )
      }

      const payload = (await response
        .json()
        .catch(() => ({}))) as ProductListResponse & {
        message?: string
      }

      if (!response.ok) {
        throw new Error(payload.message || "Nem sikerült lekérni a termékeket.")
      }

      const nextProducts = Array.isArray(payload.products)
        ? payload.products
        : []

      setProducts(nextProducts)
      setCount(
        typeof payload.count === "number"
          ? payload.count
          : nextProducts.length
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nem sikerült lekérni a termékeket."
      toast.error("Termékek", {
        description: message,
      })
    } finally {
      setLoadingProducts(false)
    }
  }, [limit, offset])

  const loadLookups = useCallback(async () => {
    setLoadingLookups(true)

    try {
      const [collectionsResponse, categoriesResponse, stockLocationsResponse] =
        await Promise.all([
          fetch("/admin/collections?limit=250&fields=id,title", {
            credentials: "include",
          }),
          fetch("/admin/product-categories?limit=250&fields=id,name", {
            credentials: "include",
          }),
          fetch("/admin/stock-locations?limit=200&fields=id,name", {
            credentials: "include",
          }),
        ])

      let inventoryItemsResponse = await fetch(
        "/admin/inventory-items?limit=500&fields=id,sku,height,width,length,weight,*location_levels",
        {
          credentials: "include",
        }
      )

      if (!inventoryItemsResponse.ok) {
        inventoryItemsResponse = await fetch("/admin/inventory-items?limit=500", {
          credentials: "include",
        })
      }

      const collectionsPayload = (await collectionsResponse
        .json()
        .catch(() => ({}))) as CollectionListResponse
      const categoriesPayload = (await categoriesResponse
        .json()
        .catch(() => ({}))) as CategoryListResponse
      const stockLocationsPayload = (await stockLocationsResponse
        .json()
        .catch(() => ({}))) as StockLocationListResponse
      const inventoryItemsPayload = (await inventoryItemsResponse
        .json()
        .catch(() => ({}))) as InventoryItemListResponse

      if (collectionsResponse.ok) {
        setCollections(
          Array.isArray(collectionsPayload.collections)
            ? collectionsPayload.collections
            : []
        )
      }

      if (categoriesResponse.ok) {
        setCategories(
          Array.isArray(categoriesPayload.product_categories)
            ? categoriesPayload.product_categories
            : []
        )
      }

      if (stockLocationsResponse.ok) {
        const nextLocations = Array.isArray(stockLocationsPayload.stock_locations)
          ? stockLocationsPayload.stock_locations
          : []
        setStockLocations(nextLocations)
        setDefaultLocationId((current) => {
          if (normalizeText(current)) {
            return current
          }
          return nextLocations[0]?.id ?? ""
        })
      }

      if (inventoryItemsResponse.ok) {
        const nextBySku: Record<string, InventoryItemSummary> = {}
        const items = Array.isArray(inventoryItemsPayload.inventory_items)
          ? inventoryItemsPayload.inventory_items
          : []

        for (const item of items) {
          const key = normalizeText(item.sku).toLowerCase()
          if (!key || nextBySku[key]) {
            continue
          }
          nextBySku[key] = item
        }

        setInventoryItemsBySku(nextBySku)
      }
    } catch {
      // Keep page usable even if lookups fail.
    } finally {
      setLoadingLookups(false)
    }
  }, [])

  const updateProduct = useCallback(
    async (product: ProductRow, body: Record<string, unknown>) => {
      if (updatingProductId) {
        return
      }

      setUpdatingProductId(product.id)

      try {
        const response = await fetch(
          `/admin/products/${encodeURIComponent(product.id)}`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          }
        )

        const payload = (await response
          .json()
          .catch(() => ({}))) as ProductResponse

        if (!response.ok) {
          throw new Error(
            payload.message || "Nem sikerült frissíteni a terméket."
          )
        }

        const freshProduct = await fetchProductRow(product.id)
        replaceProductRow(freshProduct)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Nem sikerült frissíteni a terméket."
        toast.error("Termék frissítése", {
          description: message,
        })
      } finally {
        setUpdatingProductId(null)
      }
    },
    [fetchProductRow, replaceProductRow, updatingProductId]
  )

  const updateVariantDimensions = useCallback(
    async (
      product: ProductRow,
      variantId: string,
      field: DimensionField,
      value: number | null
    ) => {
      if (updatingProductId) {
        return
      }

      setUpdatingProductId(product.id)

      try {
        const response = await fetch(
          `/admin/products/${encodeURIComponent(
            product.id
          )}/variants/${encodeURIComponent(variantId)}`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              [field]: value,
            }),
          }
        )

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          const message =
            typeof payload?.message === "string"
              ? payload.message
              : "Nem sikerült frissíteni a méret adatot."
          throw new Error(message)
        }

        const freshProduct = await fetchProductRow(product.id)
        replaceProductRow(freshProduct)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Nem sikerült frissíteni a méret adatot."
        toast.error("Méretek frissítése", {
          description: message,
        })
      } finally {
        setUpdatingProductId(null)
      }
    },
    [fetchProductRow, replaceProductRow, updatingProductId]
  )

  const updateVariantPrice = useCallback(
    async (
      product: ProductRow,
      variantId: string,
      amount: number,
      currentPrice: ProductVariantPrice | null,
      targetCurrencyCode?: PriceCurrency
    ) => {
      if (updatingProductId) {
        return
      }

      setUpdatingProductId(product.id)

      try {
        const currencyCode =
          normalizeText(targetCurrencyCode).toLowerCase() ||
          normalizeText(currentPrice?.currency_code).toLowerCase() ||
          "huf"

        const pricePayload: Record<string, unknown> = {
          currency_code: currencyCode,
          amount,
        }

        const existingPriceId = normalizeText(currentPrice?.id)
        if (existingPriceId) {
          pricePayload.id = existingPriceId
        }

        if (typeof currentPrice?.min_quantity === "number") {
          pricePayload.min_quantity = currentPrice.min_quantity
        }

        if (typeof currentPrice?.max_quantity === "number") {
          pricePayload.max_quantity = currentPrice.max_quantity
        }

        if (currentPrice?.rules && Object.keys(currentPrice.rules).length > 0) {
          pricePayload.rules = currentPrice.rules
        }

        const response = await fetch(
          `/admin/products/${encodeURIComponent(
            product.id
          )}/variants/${encodeURIComponent(variantId)}`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              prices: [pricePayload],
            }),
          }
        )

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          const message =
            typeof payload?.message === "string"
              ? payload.message
              : "Nem sikerült frissíteni az árat."
          throw new Error(message)
        }

        const freshProduct = await fetchProductRow(product.id)
        replaceProductRow(freshProduct)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Nem sikerült frissíteni az árat."
        toast.error("Ár frissítése", {
          description: message,
        })
      } finally {
        setUpdatingProductId(null)
      }
    },
    [fetchProductRow, replaceProductRow, updatingProductId]
  )

  const updateInventoryItemDimensions = useCallback(
    async (
      product: ProductRow,
      inventoryItem: InventoryItemSummary,
      field: DimensionField,
      value: number | null
    ) => {
      if (updatingProductId) {
        return
      }

      setUpdatingProductId(product.id)

      try {
        const response = await fetch(
          `/admin/inventory-items/${encodeURIComponent(inventoryItem.id)}`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              [field]: value,
            }),
          }
        )

        const payload = (await response
          .json()
          .catch(() => ({}))) as InventoryItemResponse

        if (!response.ok) {
          throw new Error(
            payload.message || "Nem sikerült frissíteni a méret adatot."
          )
        }

        const nextInventoryItem = payload.inventory_item ?? {
          ...inventoryItem,
          [field]: value,
        }
        const skuKey = normalizeText(
          nextInventoryItem.sku || inventoryItem.sku
        ).toLowerCase()

        if (skuKey) {
          setInventoryItemsBySku((currentMap) => {
            return {
              ...currentMap,
              [skuKey]: nextInventoryItem,
            }
          })
        }

        const freshProduct = await fetchProductRow(product.id)
        replaceProductRow(freshProduct)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Nem sikerült frissíteni a méret adatot."
        toast.error("Méretek frissítése", {
          description: message,
        })
      } finally {
        setUpdatingProductId(null)
      }
    },
    [fetchProductRow, replaceProductRow, updatingProductId]
  )

  const loadInventoryItem = useCallback(async (itemId: string) => {
    const params = new URLSearchParams()
    params.set("fields", "id,sku,height,width,length,weight,*location_levels")

    let response = await fetch(
      `/admin/inventory-items/${encodeURIComponent(
        itemId
      )}?${params.toString()}`,
      {
        credentials: "include",
      }
    )

    if (!response.ok) {
      response = await fetch(
        `/admin/inventory-items/${encodeURIComponent(itemId)}`,
        {
          credentials: "include",
        }
      )
    }

    const payload = (await response
      .json()
      .catch(() => ({}))) as InventoryItemResponse

    if (!response.ok || !payload.inventory_item) {
      throw new Error(payload.message || "Nem sikerült lekérni a készlet adatot.")
    }

    return payload.inventory_item
  }, [])

  const updateLevelBatch = useCallback(
    async (
      inventoryItemId: string,
      globalBody: Record<string, unknown>,
      itemBody: Record<string, unknown>
    ) => {
      let response = await fetch(
        "/admin/inventory-items/location-levels/batch",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(globalBody),
        }
      )

      if (response.status === 404) {
        response = await fetch(
          `/admin/inventory-items/${encodeURIComponent(
            inventoryItemId
          )}/location-levels/batch`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(itemBody),
          }
        )
      }

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const errorMessage =
          typeof payload?.message === "string"
            ? payload.message
            : "Nem sikerült frissíteni a készletet."
        throw new Error(errorMessage)
      }
    },
    []
  )

  const updateStockForProduct = useCallback(
    async (
      product: ProductRow,
      resolveNextStock: (currentStock: number) => number
    ) => {
      if (updatingProductId) {
        return
      }

      const mappedInventoryItem = resolveInventoryItemForProduct(product)
      if (!mappedInventoryItem) {
        toast.error("Készlet frissítése", {
          description: "Ehhez a termékhez nincs kapcsolt készlet elem.",
        })
        return
      }

      setUpdatingProductId(product.id)
      const skuKey = normalizeText(mappedInventoryItem.sku).toLowerCase()
      const previousSnapshot = mappedInventoryItem

      try {
        const enrichedItem = readLocationLevels(mappedInventoryItem).length
          ? mappedInventoryItem
          : await loadInventoryItem(mappedInventoryItem.id)

        const activeLocationId = resolveActiveLocationId(enrichedItem)
        if (!activeLocationId) {
          throw new Error(
            "Nincs elérhető raktárhely. Hozz létre legalább egyet."
          )
        }

        const currentLevel = readLevelForLocation(enrichedItem, activeLocationId)
        const currentStock = normalizeNumber(currentLevel?.stocked_quantity)
        const nextStock = Math.max(
          0,
          Math.trunc(resolveNextStock(currentStock))
        )

        if (nextStock === currentStock) {
          return
        }

        const optimisticItem = upsertLocationLevelStock(
          enrichedItem,
          activeLocationId,
          nextStock
        )

        if (skuKey) {
          setInventoryItemsBySku((currentMap) => {
            return {
              ...currentMap,
              [skuKey]: optimisticItem,
            }
          })
        }

        const globalBody = currentLevel
          ? {
              update: [
                {
                  inventory_item_id: enrichedItem.id,
                  location_id: activeLocationId,
                  stocked_quantity: nextStock,
                },
              ],
            }
          : {
              create: [
                {
                  inventory_item_id: enrichedItem.id,
                  location_id: activeLocationId,
                  stocked_quantity: nextStock,
                },
              ],
            }

        const itemBody = currentLevel
          ? {
              update: [
                {
                  location_id: activeLocationId,
                  stocked_quantity: nextStock,
                },
              ],
            }
          : {
              create: [
                {
                  location_id: activeLocationId,
                  stocked_quantity: nextStock,
                },
              ],
            }

        await updateLevelBatch(enrichedItem.id, globalBody, itemBody)
      } catch (error) {
        if (skuKey) {
          setInventoryItemsBySku((currentMap) => {
            return {
              ...currentMap,
              [skuKey]: previousSnapshot,
            }
          })
        }

        const message =
          error instanceof Error
            ? error.message
            : "Nem sikerült frissíteni a készletet."
        toast.error("Készlet frissítése", {
          description: message,
        })
      } finally {
        setUpdatingProductId(null)
      }
    },
    [
      loadInventoryItem,
      resolveActiveLocationId,
      resolveInventoryItemForProduct,
      updateLevelBatch,
      updatingProductId,
    ]
  )

  const handleAdjustStock = useCallback(
    async (product: ProductRow, delta: number) => {
      if (delta === 0) {
        return
      }

      setEditingStockProductId(null)
      setEditingStockValue("")
      await updateStockForProduct(product, (currentStock) => {
        return currentStock + delta
      })
    },
    [updateStockForProduct]
  )

  const beginEditStock = useCallback(
    (productId: string, currentStock: number) => {
      setOpenActionsProductId(null)
      setEditingCell(null)
      setEditingValue("")
      setEditingStockProductId(productId)
      setEditingStockValue(String(Math.max(0, Math.trunc(currentStock))))
    },
    []
  )

  const cancelEditStock = useCallback(() => {
    setEditingStockProductId(null)
    setEditingStockValue("")
  }, [])

  const commitEditStock = useCallback(
    async (product: ProductRow) => {
      if (editingStockProductId !== product.id) {
        return
      }

      const parsedValue = Number(editingStockValue)
      if (!Number.isFinite(parsedValue)) {
        toast.error("Készlet frissítése", {
          description: "Adj meg egy ervenyes darabszamot.",
        })
        return
      }

      cancelEditStock()
      await updateStockForProduct(product, () => parsedValue)
    },
    [cancelEditStock, editingStockProductId, editingStockValue, updateStockForProduct]
  )

  const handleStockInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, product: ProductRow) => {
      if (event.key === "Enter") {
        event.preventDefault()
        void commitEditStock(product)
      }

      if (event.key === "Escape") {
        event.preventDefault()
        cancelEditStock()
      }
    },
    [cancelEditStock, commitEditStock]
  )

  const deleteProduct = useCallback(
    async (product: ProductRow) => {
      if (updatingProductId) {
        return
      }

      const confirmed = window.confirm(
        `Biztosan törlöd ezt a terméket?\n${normalizeText(product.title) || product.id}`
      )

      if (!confirmed) {
        return
      }

      setUpdatingProductId(product.id)

      try {
        const response = await fetch(
          `/admin/products/${encodeURIComponent(product.id)}`,
          {
            method: "DELETE",
            credentials: "include",
          }
        )

        const payload = (await response
          .json()
          .catch(() => ({}))) as { message?: string }

        if (!response.ok) {
          throw new Error(payload.message || "Nem sikerült törölni a terméket.")
        }

        setProducts((currentRows) => {
          return currentRows.filter((row) => row.id !== product.id)
        })
        setCount((currentCount) => Math.max(0, currentCount - 1))
        setOpenActionsProductId((current) => {
          return current === product.id ? null : current
        })

        toast.success("Termék", {
          description: "A termék törlése sikeres.",
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Nem sikerült törölni a terméket."
        toast.error("Termék törlése", {
          description: message,
        })
      } finally {
        setUpdatingProductId(null)
      }
    },
    [updatingProductId]
  )

  const getEditableCellValue = useCallback(
    (product: ProductRow, field: EditableField) => {
      if (field === "title") {
        return normalizeText(product.title)
      }

      if (field === "priceEur" || field === "priceHuf") {
        const variant = resolvePrimaryVariant(product)
        const priceValue = resolvePriceAmount(
          resolveVariantPriceByCurrency(
            variant,
            field === "priceEur" ? "EUR" : "HUF"
          )
        )
        return priceValue === null ? "" : String(priceValue)
      }

      const dimensionValue = resolveDimensionValue(product, field)
      return dimensionValue === null ? "" : String(dimensionValue)
    },
    [resolveDimensionValue]
  )

  const beginEditCell = useCallback(
    (product: ProductRow, field: EditableField) => {
      setEditingStockProductId(null)
      setEditingStockValue("")
      setEditingCell({
        productId: product.id,
        field,
      })
      setEditingValue(getEditableCellValue(product, field))
      setOpenActionsProductId(null)
    },
    [getEditableCellValue]
  )

  const cancelEditCell = useCallback(() => {
    setEditingCell(null)
    setEditingValue("")
  }, [])

  const commitEditCell = useCallback(
    async (product: ProductRow) => {
      if (!editingCell || editingCell.productId !== product.id) {
        return
      }

      const field = editingCell.field
      const value = normalizeText(editingValue)
      cancelEditCell()

      if (field === "title") {
        const nextTitle = value
        if (!nextTitle || nextTitle === normalizeText(product.title)) {
          return
        }
        await updateProduct(product, { title: nextTitle })
        return
      }

      if (field === "priceEur" || field === "priceHuf") {
        const variant = resolvePrimaryVariant(product)
        if (!variant) {
          toast.error("Ár frissítése", {
            description: "Ehhez a termékhez nincs variáns.",
          })
          return
        }

        if (!value) {
          toast.error("Ár frissítése", {
            description: "Adj meg egy érvényes árat.",
          })
          return
        }

        const parsedPrice = Number(value)
        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
          toast.error("Ár frissítése", {
            description: "Adj meg egy érvényes, nem negatív számot.",
          })
          return
        }

        const nextPrice = Math.trunc(parsedPrice)
        const priceCurrency: PriceCurrency =
          field === "priceEur" ? "EUR" : "HUF"
        const currentPrice = resolveVariantPriceByCurrency(
          variant,
          priceCurrency
        )
        const currentPriceAmount = resolvePriceAmount(currentPrice)
        if (nextPrice === currentPriceAmount) {
          return
        }

        await updateVariantPrice(
          product,
          variant.id,
          nextPrice,
          currentPrice,
          priceCurrency
        )
        return
      }

      const nextValue = normalizeText(value)
        ? (() => {
            const parsed = Number(value)
            if (!Number.isFinite(parsed)) {
              return Number.NaN
            }
            return Math.trunc(parsed)
          })()
        : null

      if (typeof nextValue === "number" && !Number.isFinite(nextValue)) {
        toast.error("Méretek frissítése", {
          description: "Adj meg egy érvényes számot.",
        })
        return
      }

      const currentValue = resolveDimensionValue(product, field)
      if (nextValue === currentValue) {
        return
      }

      const inventoryItem = resolveInventoryItemForProduct(product)
      if (inventoryItem) {
        await updateInventoryItemDimensions(
          product,
          inventoryItem,
          field,
          nextValue
        )
        return
      }

      const variant = resolvePrimaryVariant(product)
      if (!variant) {
        toast.error("Méretek frissítése", {
          description: "Ehhez a termékhez nincs variáns.",
        })
        return
      }

      await updateVariantDimensions(product, variant.id, field, nextValue)
    },
    [
      cancelEditCell,
      editingCell,
      editingValue,
      resolveDimensionValue,
      resolveInventoryItemForProduct,
      updateProduct,
      updateInventoryItemDimensions,
      updateVariantPrice,
      updateVariantDimensions,
    ]
  )

  const handleEditInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, product: ProductRow) => {
      if (event.key === "Enter") {
        event.preventDefault()
        void commitEditCell(product)
      }

      if (event.key === "Escape") {
        event.preventDefault()
        cancelEditCell()
      }
    },
    [cancelEditCell, commitEditCell]
  )

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  useEffect(() => {
    void loadLookups()
  }, [loadLookups])

  useEffect(() => {
    if (!openActionsProductId) {
      return
    }

    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (target?.closest("[data-product-row-actions]")) {
        return
      }
      setOpenActionsProductId(null)
    }

    document.addEventListener("mousedown", handleDocumentMouseDown)
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown)
    }
  }, [openActionsProductId])

  return (
    <div className="flex flex-col gap-y-4">
      <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-6 shadow-card-rest">
        <div className="flex flex-col gap-y-1">
          <Text size="large" weight="plus">
            Termékek kezelő
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Név, státusz, gyűjtemény, kategória, ár és méretek gyors
            szerkesztése közvetlenül a listában.
          </Text>
        </div>

        <div className="mt-4 flex flex-col gap-3 xl:flex-row">
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault()
              setSearchInput(normalizeText(searchInput))
            }}
          >
            <Input
              value={searchInput}
              onChange={(
                event: ChangeEvent<HTMLInputElement>
              ) => setSearchInput(event.target.value)}
              placeholder="Keresés termék, SKU, gyűjtemény vagy kategória alapján"
            />
            <Button type="submit" variant="secondary">
              Keresés
            </Button>
            {searchInput.trim().length > 0 ? (
              <Button
                type="button"
                variant="transparent"
                onClick={() => setSearchInput("")}
              >
                Törlés
              </Button>
            ) : null}
          </form>

          <div className="flex items-center gap-2">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Sorok
            </Text>
            <select
              value={String(limit)}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                const parsed = Number(event.target.value)
                const nextLimit = Number.isFinite(parsed)
                  ? parsed
                  : 50
                setLimit(nextLimit)
                setOffset(0)
              }}
              className="h-10 rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base"
            >
              {PAGE_SIZE_OPTIONS.map((value) => (
                <option key={value} value={String(value)}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-6 shadow-card-rest">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-ui-border-base text-left text-ui-fg-subtle">
                <th className="py-3 pr-4 font-normal">Termék</th>
                <th className="py-3 pr-4 font-normal">Gyűjtemény</th>
                <th className="py-3 pr-4 font-normal">Kategória</th>
                <th className="py-3 pr-4 font-normal">Magasság</th>
                <th className="py-3 pr-4 font-normal">Szélesség</th>
                <th className="py-3 pr-4 font-normal">Hossz</th>
                <th className="py-3 pr-4 font-normal">Súly</th>
                <th className="py-3 pr-4 font-normal">Ár</th>
                <th className="py-3 pr-4 font-normal">Készlet</th>
                <th className="py-3 pr-0 text-right font-normal">Műveletek</th>
                <th className="border-l border-ui-border-base/80 py-3 pl-6 font-normal">
                  Státusz
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingProducts ? (
                <tr>
                  <td colSpan={11} className="py-6 text-ui-fg-subtle">
                    Betöltés...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-6 text-ui-fg-subtle">
                    Nincs találat.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const variant = resolvePrimaryVariant(product)
                  const inventoryItem = resolveInventoryItemForProduct(product)
                  const rowUpdating = updatingProductId === product.id
                  const primaryCategory = resolvePrimaryCategory(product)
                  const heightValue = resolveDimensionValue(product, "height")
                  const widthValue = resolveDimensionValue(product, "width")
                  const lengthValue = resolveDimensionValue(product, "length")
                  const weightValue = resolveDimensionValue(product, "weight")
                  const eurPriceValue = resolvePriceAmount(
                    resolveVariantPriceByCurrency(variant, "EUR")
                  )
                  const hufPriceValue = resolvePriceAmount(
                    resolveVariantPriceByCurrency(variant, "HUF")
                  )
                  const stockValue = resolveStockValue(product)
                  const isEditingStock = editingStockProductId === product.id
                  const canEditDimensions = Boolean(variant || inventoryItem)

                  const renderEditableCell = (
                    field: EditableField,
                    fallback: string
                  ) => {
                    const isEditing =
                      editingCell?.productId === product.id &&
                      editingCell.field === field

                    if (isEditing) {
                      const inputType =
                        field === "title" ? "text" : "number"
                      const isTitleField = field === "title"
                      const isPriceField =
                        field === "priceEur" || field === "priceHuf"

                      return (
                        <input
                          type={inputType}
                          value={editingValue}
                          onChange={(
                            event: ChangeEvent<HTMLInputElement>
                          ) => setEditingValue(event.target.value)}
                          onBlur={() => {
                            void commitEditCell(product)
                          }}
                          onKeyDown={(
                            event: KeyboardEvent<HTMLInputElement>
                          ) => handleEditInputKeyDown(event, product)}
                          className={
                            isTitleField
                              ? "h-8 w-full min-w-[20rem] rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                              : isPriceField
                                ? "h-8 w-24 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                                : "h-8 w-20 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                          }
                          autoFocus
                        />
                      )
                    }

                    const isTitleField = field === "title"
                    const isPriceField =
                      field === "priceEur" || field === "priceHuf"
                    return (
                      <button
                        type="button"
                        className={
                          isTitleField
                            ? "w-full min-w-[20rem] rounded-md border border-ui-border-base px-2 py-1 text-left text-sm hover:bg-ui-bg-subtle"
                            : isPriceField
                              ? "min-w-20 rounded-md border border-ui-border-base px-2 py-1 text-left text-sm hover:bg-ui-bg-subtle"
                              : "min-w-16 rounded-md border border-ui-border-base px-2 py-1 text-left text-sm hover:bg-ui-bg-subtle"
                        }
                        disabled={Boolean(updatingProductId)}
                        onClick={() => beginEditCell(product, field)}
                      >
                        {fallback}
                      </button>
                    )
                  }

                  return (
                    <tr
                      key={product.id}
                      className="border-b border-ui-border-base/60"
                    >
                      <td className="py-3 pr-4 min-w-[20rem]">
                        {renderEditableCell(
                          "title",
                          normalizeText(product.title) || "-"
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <select
                          value={
                            normalizeText(product.collection_id) ||
                            normalizeText(product.collection?.id)
                          }
                          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                            void updateProduct(product, {
                              collection_id:
                                normalizeText(event.target.value) || null,
                            })
                          }}
                          disabled={rowUpdating || loadingLookups}
                          className="h-9 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                        >
                          <option value="">Nincs gyűjtemény</option>
                          {collections.map((collection) => (
                            <option key={collection.id} value={collection.id}>
                              {normalizeText(collection.title) || collection.id}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-4">
                        <select
                          value={normalizeText(primaryCategory?.id)}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                            const nextCategoryId = normalizeText(
                              event.target.value
                            )
                            void updateProduct(product, {
                              categories: nextCategoryId
                                ? [{ id: nextCategoryId }]
                                : [],
                            })
                          }}
                          disabled={rowUpdating || loadingLookups}
                          className="h-9 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                        >
                          <option value="">Nincs kategória</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {normalizeText(category.name) || category.id}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-4">
                        {canEditDimensions
                          ? renderEditableCell(
                              "height",
                              heightValue === null ? "-" : String(heightValue)
                            )
                          : "-"}
                      </td>
                      <td className="py-3 pr-4">
                        {canEditDimensions
                          ? renderEditableCell(
                              "width",
                              widthValue === null ? "-" : String(widthValue)
                            )
                          : "-"}
                      </td>
                      <td className="py-3 pr-4">
                        {canEditDimensions
                          ? renderEditableCell(
                              "length",
                              lengthValue === null ? "-" : String(lengthValue)
                            )
                          : "-"}
                      </td>
                      <td className="py-3 pr-4">
                        {canEditDimensions
                          ? renderEditableCell(
                              "weight",
                              weightValue === null ? "-" : String(weightValue)
                            )
                          : "-"}
                      </td>
                      <td className="py-3 pr-4">
                        {variant ? (
                          <div className="flex min-w-[14rem] flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2">
                              <Text
                                size="xsmall"
                                className="w-8 uppercase text-ui-fg-subtle"
                              >
                                EUR
                              </Text>
                              {renderEditableCell(
                                "priceEur",
                                eurPriceValue === null
                                  ? "-"
                                  : String(eurPriceValue)
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Text
                                size="xsmall"
                                className="w-8 uppercase text-ui-fg-subtle"
                              >
                                HUF
                              </Text>
                              {renderEditableCell(
                                "priceHuf",
                                hufPriceValue === null
                                  ? "-"
                                  : String(hufPriceValue)
                              )}
                            </div>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {inventoryItem ? (
                          <div className="inline-flex items-center gap-1 rounded-md border border-ui-border-base bg-ui-bg-field px-1 py-1">
                            <button
                              type="button"
                              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-ui-bg-subtle disabled:opacity-50"
                              disabled={rowUpdating}
                              onClick={() => {
                                void handleAdjustStock(product, -1)
                              }}
                              aria-label="Készlet csökkentése"
                            >
                              <MinusMini className="h-4 w-4" />
                            </button>
                            {isEditingStock ? (
                              <input
                                type="number"
                                value={editingStockValue}
                                onChange={(
                                  event: ChangeEvent<HTMLInputElement>
                                ) => setEditingStockValue(event.target.value)}
                                onBlur={() => {
                                  void commitEditStock(product)
                                }}
                                onKeyDown={(
                                  event: KeyboardEvent<HTMLInputElement>
                                ) => handleStockInputKeyDown(event, product)}
                                className="h-7 w-16 rounded-md border border-ui-border-base bg-ui-bg-base px-2 text-center text-sm"
                                autoFocus
                              />
                            ) : (
                              <button
                                type="button"
                                className="h-7 min-w-14 rounded-md px-2 text-center text-sm hover:bg-ui-bg-subtle"
                                disabled={rowUpdating}
                                onClick={() => {
                                  beginEditStock(product.id, stockValue ?? 0)
                                }}
                              >
                                {String(stockValue ?? 0)}
                              </button>
                            )}
                            <button
                              type="button"
                              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-ui-bg-subtle disabled:opacity-50"
                              disabled={rowUpdating}
                              onClick={() => {
                                void handleAdjustStock(product, 1)
                              }}
                              aria-label="Készlet növelése"
                            >
                              <PlusMini className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-3 pr-0 text-right">
                        <div
                          className="relative inline-flex"
                          data-product-row-actions
                        >
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-ui-border-base text-sm hover:bg-ui-bg-subtle"
                            disabled={Boolean(updatingProductId)}
                            onClick={() => {
                              setOpenActionsProductId((current) => {
                                return current === product.id ? null : product.id
                              })
                            }}
                            aria-label="Műveletek"
                          >
                            <EllipsisHorizontal className="h-4 w-4" />
                          </button>
                          {openActionsProductId === product.id ? (
                            <div className="absolute right-0 top-9 z-10 min-w-36 overflow-hidden rounded-md border border-ui-border-base bg-ui-bg-component shadow-elevation-card-rest">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ui-bg-subtle"
                                onClick={() => {
                                  beginEditCell(product, "title")
                                }}
                              >
                                <PencilSquare className="h-4 w-4" />
                                Szerkesztés
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ui-fg-error hover:bg-ui-bg-subtle"
                                onClick={() => {
                                  setOpenActionsProductId(null)
                                  void deleteProduct(product)
                                }}
                              >
                                <Trash className="h-4 w-4" />
                                Törlés
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="border-l border-ui-border-base/60 py-3 pl-6">
                        <select
                          value={normalizeText(product.status).toLowerCase()}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                            const nextStatus = normalizeText(event.target.value)
                            if (!nextStatus) {
                              return
                            }
                            void updateProduct(product, {
                              status: nextStatus,
                            })
                          }}
                          disabled={rowUpdating}
                          className="h-9 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                        >
                          {STATUS_OPTIONS.map((statusOption) => (
                            <option
                              key={statusOption.value}
                              value={statusOption.value}
                            >
                              {statusOption.label}
                            </option>
                          ))}
                        </select>
                        <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                          {resolveStatusLabel(product.status)}
                        </Text>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Text size="xsmall" className="text-ui-fg-subtle">
            {searchInput.trim().length > 0
              ? `${filteredProducts.length} találat ezen az oldalon`
              : count > 0
                ? `${offset + 1}-${Math.min(offset + products.length, count)} / ${count}`
                : "0 / 0"}
          </Text>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="small"
              disabled={offset <= 0 || loadingProducts}
              onClick={() => {
                setOffset((current: number) => Math.max(0, current - limit))
              }}
            >
              Előző
            </Button>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Oldal {currentPage} / {totalPages}
            </Text>
            <Button
              type="button"
              variant="secondary"
              size="small"
              disabled={offset + products.length >= count || loadingProducts}
              onClick={() => {
                setOffset((current: number) => current + limit)
              }}
            >
              Következő
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Termékek kezelő",
  nested: "/products",
})

export default ProductsQuickPage
