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

type InventoryLevel = {
  id?: string
  location_id?: string | null
  stocked_quantity?: number | null
  reserved_quantity?: number | null
}

type InventoryItem = {
  id: string
  title?: string | null
  sku?: string | null
  location_levels?: InventoryLevel[] | null
}

type StockLocation = {
  id: string
  name?: string | null
}

type InventoryListResponse = {
  inventory_items?: InventoryItem[]
  count?: number
}

type InventoryItemResponse = {
  inventory_item?: InventoryItem
}

type StockLocationListResponse = {
  stock_locations?: StockLocation[]
}

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const

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

const readLocationLevels = (item: InventoryItem) => {
  return Array.isArray(item.location_levels) ? item.location_levels : []
}

const readLevelForLocation = (
  item: InventoryItem,
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

const resolveDisplayQuantities = (
  item: InventoryItem,
  selectedLocationId: string
) => {
  const normalizedLocationId = normalizeText(selectedLocationId)
  const levels = readLocationLevels(item)

  if (normalizedLocationId) {
    const level = readLevelForLocation(item, normalizedLocationId)
    return {
      stocked: normalizeNumber(level?.stocked_quantity),
      reserved: normalizeNumber(level?.reserved_quantity),
    }
  }

  return levels.reduce(
    (acc, level) => {
      return {
        stocked: acc.stocked + normalizeNumber(level.stocked_quantity),
        reserved: acc.reserved + normalizeNumber(level.reserved_quantity),
      }
    },
    { stocked: 0, reserved: 0 }
  )
}

const matchesSearch = (item: InventoryItem, query: string) => {
  const normalizedQuery = normalizeText(query).toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  const title = normalizeText(item.title).toLowerCase()
  const sku = normalizeText(item.sku).toLowerCase()

  return (
    title.includes(normalizedQuery) || sku.includes(normalizedQuery)
  )
}

const upsertLocationLevelStock = (
  item: InventoryItem,
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
        if (
          normalizeText(level.location_id) !== normalizedLocationId
        ) {
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

const InventoryQuickPage = () => {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [limit, setLimit] = useState<number>(50)
  const [offset, setOffset] = useState(0)
  const [count, setCount] = useState(0)
  const [loadingItems, setLoadingItems] = useState(false)
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(
    null
  )
  const [editingStockItemId, setEditingStockItemId] = useState<
    string | null
  >(null)
  const [editingStockValue, setEditingStockValue] = useState("")

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

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      return matchesSearch(item, searchInput)
    })
  }, [items, searchInput])

  const searchSuggestions = useMemo(() => {
    const normalizedQuery = normalizeText(searchInput).toLowerCase()
    const seen = new Set<string>()
    const suggestions: string[] = []

    for (const item of items) {
      const candidates = [
        normalizeText(item.sku),
        normalizeText(item.title),
      ]

      for (const candidate of candidates) {
        if (!candidate) {
          continue
        }

        if (
          normalizedQuery &&
          !candidate.toLowerCase().includes(normalizedQuery)
        ) {
          continue
        }

        const key = candidate.toLowerCase()
        if (seen.has(key)) {
          continue
        }

        seen.add(key)
        suggestions.push(candidate)

        if (suggestions.length >= 8) {
          return suggestions
        }
      }
    }

    return suggestions
  }, [items, searchInput])

  const loadStockLocations = useCallback(async () => {
    setLoadingLocations(true)

    try {
      const response = await fetch(
        "/admin/stock-locations?limit=200&fields=id,name",
        {
          credentials: "include",
        }
      )

      const payload = (await response
        .json()
        .catch(() => ({}))) as StockLocationListResponse & {
        message?: string
      }

      if (!response.ok) {
        throw new Error(
          payload.message ||
            "Nem sikerült lekérni a raktárhelyeket."
        )
      }

      const nextLocations = Array.isArray(payload.stock_locations)
        ? payload.stock_locations
        : []

      setLocations(nextLocations)
      setSelectedLocationId((current: string) => {
        if (normalizeText(current)) {
          return current
        }

        return nextLocations[0]?.id ?? ""
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nem sikerült lekérni a raktárhelyeket."
      toast.error("Készlet", {
        description: message,
      })
    } finally {
      setLoadingLocations(false)
    }
  }, [])

  const loadInventoryItems = useCallback(async () => {
    setLoadingItems(true)

    try {
      const params = new URLSearchParams()
      params.set("limit", String(limit))
      params.set("offset", String(offset))
      params.set("fields", "id,title,sku,*location_levels")

      let response = await fetch(
        `/admin/inventory-items?${params.toString()}`,
        {
          credentials: "include",
        }
      )

      if (!response.ok) {
        const fallbackParams = new URLSearchParams(params)
        fallbackParams.delete("fields")
        response = await fetch(
          `/admin/inventory-items?${fallbackParams.toString()}`,
          {
            credentials: "include",
          }
        )
      }

      const payload = (await response
        .json()
        .catch(() => ({}))) as InventoryListResponse & {
        message?: string
      }

      if (!response.ok) {
        throw new Error(
          payload.message ||
            "Nem sikerült lekérni a készlet elemeket."
        )
      }

      const nextItems = Array.isArray(payload.inventory_items)
        ? payload.inventory_items
        : []

      setItems(nextItems)
      setCount(
        typeof payload.count === "number" ? payload.count : nextItems.length
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nem sikerült lekérni a készlet elemeket."
      toast.error("Készlet", {
        description: message,
      })
    } finally {
      setLoadingItems(false)
    }
  }, [limit, offset])

  const loadInventoryItem = useCallback(async (itemId: string) => {
    const params = new URLSearchParams()
    params.set("fields", "id,title,sku,*location_levels")

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
      .catch(() => ({}))) as InventoryItemResponse & {
      message?: string
    }

    if (!response.ok) {
      throw new Error(
        payload.message || "Nem sikerült lekérni a készlet elemet."
      )
    }

    return payload.inventory_item ?? null
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

  const resolveActiveLocationId = useCallback(
    (item: InventoryItem) => {
      const selected = normalizeText(selectedLocationId)
      if (selected) {
        return selected
      }

      const fromItem = normalizeText(
        readLocationLevels(item)[0]?.location_id
      )
      if (fromItem) {
        return fromItem
      }

      return normalizeText(locations[0]?.id)
    },
    [locations, selectedLocationId]
  )

  const updateStockForItem = useCallback(
    async (
      item: InventoryItem,
      resolveNextStock: (currentStock: number) => number
    ) => {
      if (updatingItemId) {
        return
      }

      setUpdatingItemId(item.id)
      let previousItemSnapshot: InventoryItem | null = null

      try {
        const enrichedItem = readLocationLevels(item).length
          ? item
          : await loadInventoryItem(item.id)

        if (!enrichedItem) {
          throw new Error("A készlet elem nem található.")
        }

        const activeLocationId = resolveActiveLocationId(enrichedItem)
        if (!activeLocationId) {
          throw new Error(
            "Nincs elérhető raktárhely. Hozz létre legalább egyet."
          )
        }

        const currentLevel = readLevelForLocation(
          enrichedItem,
          activeLocationId
        )
        const currentStock = normalizeNumber(
          currentLevel?.stocked_quantity
        )
        const nextStock = Math.max(
          0,
          Math.trunc(resolveNextStock(currentStock))
        )

        if (nextStock === currentStock) {
          return
        }

        previousItemSnapshot =
          items.find((entry) => entry.id === item.id) ?? enrichedItem

        const optimisticItem = upsertLocationLevelStock(
          previousItemSnapshot,
          activeLocationId,
          nextStock
        )

        setItems((currentItems) => {
          return currentItems.map((currentItem) => {
            if (currentItem.id !== item.id) {
              return currentItem
            }
            return optimisticItem
          })
        })

        const globalBody = currentLevel
          ? {
              update: [
                {
                  inventory_item_id: item.id,
                  location_id: activeLocationId,
                  stocked_quantity: nextStock,
                },
              ],
            }
          : {
              create: [
                {
                  inventory_item_id: item.id,
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

        await updateLevelBatch(item.id, globalBody, itemBody)
      } catch (error) {
        if (previousItemSnapshot) {
          setItems((currentItems) => {
            return currentItems.map((currentItem) => {
              if (currentItem.id !== item.id) {
                return currentItem
              }

              return previousItemSnapshot as InventoryItem
            })
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
        setUpdatingItemId(null)
      }
    },
    [
      items,
      loadInventoryItem,
      resolveActiveLocationId,
      updateLevelBatch,
      updatingItemId,
    ]
  )

  const handleAdjustStock = useCallback(
    async (item: InventoryItem, delta: number) => {
      if (delta === 0) {
        return
      }

      setEditingStockItemId(null)
      setEditingStockValue("")

      await updateStockForItem(item, (currentStock) => {
        return currentStock + delta
      })
    },
    [updateStockForItem]
  )

  const beginEditStock = useCallback(
    (itemId: string, currentStock: number) => {
      setEditingStockItemId(itemId)
      setEditingStockValue(String(Math.max(0, Math.trunc(currentStock))))
    },
    []
  )

  const cancelEditStock = useCallback(() => {
    setEditingStockItemId(null)
    setEditingStockValue("")
  }, [])

  const commitEditStock = useCallback(
    async (item: InventoryItem) => {
      if (editingStockItemId !== item.id) {
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
      await updateStockForItem(item, () => parsedValue)
    },
    [
      cancelEditStock,
      editingStockItemId,
      editingStockValue,
      updateStockForItem,
    ]
  )

  const handleStockInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, item: InventoryItem) => {
      if (event.key === "Enter") {
        event.preventDefault()
        void commitEditStock(item)
      }

      if (event.key === "Escape") {
        event.preventDefault()
        cancelEditStock()
      }
    },
    [cancelEditStock, commitEditStock]
  )

  useEffect(() => {
    void loadStockLocations()
  }, [loadStockLocations])

  useEffect(() => {
    void loadInventoryItems()
  }, [loadInventoryItems])

  return (
    <div className="flex flex-col gap-y-4">
      <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-6 shadow-card-rest">
        <div className="flex flex-col gap-y-1">
          <Text size="large" weight="plus">
            Keszlet gyors szerkeszto
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Keszlet modositas kozvetlenul a listaban. Nem kell minden
            termeket megnyitni.
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
              list="inventory-quick-suggestions"
              placeholder="Kereses cim vagy SKU alapjan"
            />
            <Button type="submit" variant="secondary">
              Kereses
            </Button>
            {searchInput.trim().length > 0 ? (
              <Button
                type="button"
                variant="transparent"
                onClick={() => setSearchInput("")}
              >
                Torles
              </Button>
            ) : null}
          </form>
          <datalist id="inventory-quick-suggestions">
            {searchSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>

          <div className="flex items-center gap-2">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Raktarhely
            </Text>
            <select
              value={selectedLocationId}
              onChange={(
                event: ChangeEvent<HTMLSelectElement>
              ) => setSelectedLocationId(event.target.value)}
              className="h-10 rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base"
              disabled={loadingLocations || locations.length === 0}
            >
              {locations.length === 0 ? (
                <option value="">Nincs raktarhely</option>
              ) : (
                locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {normalizeText(location.name) || location.id}
                  </option>
                ))
              )}
            </select>
          </div>

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
                <th className="py-3 pr-4 font-normal">Cim</th>
                <th className="py-3 pr-4 font-normal">SKU</th>
                <th className="py-3 pr-4 font-normal">Foglalt</th>
                <th className="py-3 pr-4 font-normal">Keszleten</th>
              </tr>
            </thead>
            <tbody>
              {loadingItems ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-6 text-ui-fg-subtle"
                  >
                    Betoltes...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-6 text-ui-fg-subtle"
                  >
                    Nincs talalat.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const quantities = resolveDisplayQuantities(
                    item,
                    selectedLocationId
                  )
                  const rowIsUpdating = updatingItemId === item.id
                  const rowIsEditing = editingStockItemId === item.id

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-ui-border-base/60"
                    >
                      <td className="py-3 pr-4">
                        {normalizeText(item.title) || "-"}
                      </td>
                      <td className="py-3 pr-4">
                        {normalizeText(item.sku) || "-"}
                      </td>
                      <td className="py-3 pr-4">
                        {quantities.reserved}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="small"
                            variant="secondary"
                            disabled={
                              Boolean(updatingItemId) ||
                              rowIsUpdating ||
                              quantities.stocked <= 0
                            }
                            onClick={() =>
                              void handleAdjustStock(item, -1)
                            }
                          >
                            -
                          </Button>
                          {rowIsEditing ? (
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={editingStockValue}
                              disabled={Boolean(updatingItemId)}
                              onChange={(
                                event: ChangeEvent<HTMLInputElement>
                              ) =>
                                setEditingStockValue(
                                  event.target.value
                                )
                              }
                              onBlur={() => {
                                void commitEditStock(item)
                              }}
                              onKeyDown={(
                                event: KeyboardEvent<HTMLInputElement>
                              ) =>
                                handleStockInputKeyDown(event, item)
                              }
                              className="h-8 w-20 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-center text-sm"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              className="inline-flex min-w-12 justify-center rounded-md border border-ui-border-base px-2 py-1 text-sm hover:bg-ui-bg-subtle"
                              disabled={
                                Boolean(updatingItemId) || rowIsUpdating
                              }
                              onClick={() =>
                                beginEditStock(
                                  item.id,
                                  quantities.stocked
                                )
                              }
                            >
                              {quantities.stocked}
                            </button>
                          )}
                          <Button
                            type="button"
                            size="small"
                            variant="secondary"
                            disabled={
                              Boolean(updatingItemId) || rowIsUpdating
                            }
                            onClick={() =>
                              void handleAdjustStock(item, 1)
                            }
                          >
                            +
                          </Button>
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
              ? `${filteredItems.length} talalat ezen az oldalon`
              : count > 0
                ? `${offset + 1}-${Math.min(offset + items.length, count)} / ${count}`
                : "0 / 0"}
          </Text>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="small"
              disabled={offset <= 0 || loadingItems}
              onClick={() => {
                setOffset((current: number) =>
                  Math.max(0, current - limit)
                )
              }}
            >
              Elozo
            </Button>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Oldal {currentPage} / {totalPages}
            </Text>
            <Button
              type="button"
              variant="secondary"
              size="small"
              disabled={offset + items.length >= count || loadingItems}
              onClick={() => {
                setOffset((current: number) => current + limit)
              }}
            >
              Kovetkezo
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Keszlet+",
  nested: "/inventory",
})

export default InventoryQuickPage
