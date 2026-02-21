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
import { Button, Input, Text, toast } from "@medusajs/ui"

type ProductCollection = {
  id: string
  title?: string | null
}

type ProductCategory = {
  id: string
  name?: string | null
}

type ProductVariant = {
  id: string
  sku?: string | null
  height?: number | null
  width?: number | null
  length?: number | null
  weight?: number | null
}

type InventoryItemSummary = {
  id: string
  sku?: string | null
  height?: number | null
  width?: number | null
  length?: number | null
  weight?: number | null
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

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const
const PRODUCT_FIELDS =
  "id,title,status,collection_id,*collection,*categories,*variants"

type EditableField = "title" | "height" | "width" | "length" | "weight"
type DimensionField = Exclude<EditableField, "title">

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
      const [collectionsResponse, categoriesResponse] = await Promise.all([
        fetch("/admin/collections?limit=250&fields=id,title", {
          credentials: "include",
        }),
        fetch("/admin/product-categories?limit=250&fields=id,name", {
          credentials: "include",
        }),
      ])

      let inventoryItemsResponse = await fetch(
        "/admin/inventory-items?limit=500&fields=id,sku,height,width,length,weight",
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

      const dimensionValue = resolveDimensionValue(product, field)
      return dimensionValue === null ? "" : String(dimensionValue)
    },
    [resolveDimensionValue]
  )

  const beginEditCell = useCallback(
    (product: ProductRow, field: EditableField) => {
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
            Név, státusz, gyűjtemény, kategória és méretek gyors
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
                <th className="py-3 pr-4 font-normal">Státusz</th>
                <th className="py-3 pr-4 font-normal">Magasság</th>
                <th className="py-3 pr-4 font-normal">Szélesség</th>
                <th className="py-3 pr-4 font-normal">Hossz</th>
                <th className="py-3 pr-4 font-normal">Súly</th>
                <th className="py-3 pr-0 text-right font-normal">Műveletek</th>
              </tr>
            </thead>
            <tbody>
              {loadingProducts ? (
                <tr>
                  <td colSpan={9} className="py-6 text-ui-fg-subtle">
                    Betöltés...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-ui-fg-subtle">
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
                          className="h-8 w-28 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                          autoFocus
                        />
                      )
                    }

                    return (
                      <button
                        type="button"
                        className="rounded-md border border-ui-border-base px-2 py-1 text-left text-sm hover:bg-ui-bg-subtle"
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
                      <td className="py-3 pr-4">
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
                      <td className="py-3 pr-0 text-right">
                        <div
                          className="relative inline-flex"
                          data-product-row-actions
                        >
                          <button
                            type="button"
                            className="h-8 rounded-md border border-ui-border-base px-3 text-sm hover:bg-ui-bg-subtle"
                            disabled={Boolean(updatingProductId)}
                            onClick={() => {
                              setOpenActionsProductId((current) => {
                                return current === product.id ? null : product.id
                              })
                            }}
                          >
                            ...
                          </button>
                          {openActionsProductId === product.id ? (
                            <div className="absolute right-0 top-9 z-10 min-w-36 overflow-hidden rounded-md border border-ui-border-base bg-ui-bg-component shadow-elevation-card-rest">
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm hover:bg-ui-bg-subtle"
                                onClick={() => {
                                  beginEditCell(product, "title")
                                }}
                              >
                                Szerkesztés
                              </button>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm text-ui-fg-error hover:bg-ui-bg-subtle"
                                onClick={() => {
                                  setOpenActionsProductId(null)
                                  void deleteProduct(product)
                                }}
                              >
                                Törlés
                              </button>
                            </div>
                          ) : null}
                        </div>
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
