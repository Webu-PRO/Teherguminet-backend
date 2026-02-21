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

type ReservationInventoryItem = {
  id?: string
  sku?: string | null
  title?: string | null
  description?: string | null
}

type Reservation = {
  id: string
  quantity?: number | null
  description?: string | null
  created_at?: string | null
  line_item_id?: string | null
  inventory_item_id?: string | null
  inventory_item?: ReservationInventoryItem | null
}

type ReservationListResponse = {
  reservations?: Reservation[]
  count?: number
}

type ReservationResponse = {
  reservation?: Reservation
  message?: string
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

const formatDate = (value: string | null | undefined) => {
  const normalized = normalizeText(value)
  if (!normalized) {
    return "-"
  }

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    return normalized
  }

  return date.toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

const resolveReservationSku = (reservation: Reservation) => {
  return (
    normalizeText(reservation.inventory_item?.sku) ||
    normalizeText(reservation.inventory_item_id) ||
    "-"
  )
}

const resolveReservationDescription = (reservation: Reservation) => {
  return (
    normalizeText(reservation.description) ||
    normalizeText(reservation.inventory_item?.title) ||
    normalizeText(reservation.inventory_item?.description) ||
    normalizeText(reservation.line_item_id) ||
    "-"
  )
}

const matchesReservationSearch = (
  reservation: Reservation,
  query: string
) => {
  const normalizedQuery = normalizeText(query).toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  const values = [
    resolveReservationSku(reservation),
    resolveReservationDescription(reservation),
    normalizeText(reservation.line_item_id),
    normalizeText(reservation.id),
  ]

  return values.some((value) => {
    return value.toLowerCase().includes(normalizedQuery)
  })
}

const ReservationsQuickPage = () => {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [searchInput, setSearchInput] = useState("")
  const [limit, setLimit] = useState<number>(50)
  const [offset, setOffset] = useState(0)
  const [count, setCount] = useState(0)
  const [loadingReservations, setLoadingReservations] = useState(false)
  const [updatingReservationId, setUpdatingReservationId] = useState<
    string | null
  >(null)
  const [editingReservationId, setEditingReservationId] = useState<
    string | null
  >(null)
  const [editingReservationValue, setEditingReservationValue] =
    useState("")

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

  const filteredReservations = useMemo(() => {
    return reservations.filter((reservation) => {
      return matchesReservationSearch(reservation, searchInput)
    })
  }, [reservations, searchInput])

  const loadReservations = useCallback(async () => {
    setLoadingReservations(true)

    try {
      const params = new URLSearchParams()
      params.set("limit", String(limit))
      params.set("offset", String(offset))
      params.set(
        "fields",
        "id,quantity,description,created_at,line_item_id,inventory_item_id,*inventory_item"
      )

      let response = await fetch(
        `/admin/reservations?${params.toString()}`,
        {
          credentials: "include",
        }
      )

      if (!response.ok) {
        const fallbackParams = new URLSearchParams(params)
        fallbackParams.delete("fields")
        response = await fetch(
          `/admin/reservations?${fallbackParams.toString()}`,
          {
            credentials: "include",
          }
        )
      }

      const payload = (await response
        .json()
        .catch(() => ({}))) as ReservationListResponse & {
        message?: string
      }

      if (!response.ok) {
        throw new Error(
          payload.message || "Nem sikerült lekérni a foglalásokat."
        )
      }

      const nextReservations = Array.isArray(payload.reservations)
        ? payload.reservations
        : []

      setReservations(nextReservations)
      setCount(
        typeof payload.count === "number"
          ? payload.count
          : nextReservations.length
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nem sikerült lekérni a foglalásokat."
      toast.error("Foglalások", {
        description: message,
      })
    } finally {
      setLoadingReservations(false)
    }
  }, [limit, offset])

  const updateReservationQuantity = useCallback(
    async (reservation: Reservation, nextQuantity: number) => {
      if (updatingReservationId) {
        return
      }

      const quantity = Math.max(0, Math.trunc(nextQuantity))
      const currentQuantity = normalizeNumber(reservation.quantity)
      if (quantity === currentQuantity) {
        return
      }

      setUpdatingReservationId(reservation.id)
      const snapshot =
        reservations.find((entry) => entry.id === reservation.id) ??
        reservation

      try {
        setReservations((currentReservations) => {
          return currentReservations.map((entry) => {
            if (entry.id !== reservation.id) {
              return entry
            }

            return {
              ...entry,
              quantity,
            }
          })
        })

        const response = await fetch(
          `/admin/reservations/${encodeURIComponent(reservation.id)}`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              quantity,
            }),
          }
        )

        const payload = (await response
          .json()
          .catch(() => ({}))) as ReservationResponse

        if (!response.ok) {
          throw new Error(
            payload.message || "Nem sikerült frissíteni a foglalást."
          )
        }

        if (payload.reservation) {
          setReservations((currentReservations) => {
            return currentReservations.map((entry) => {
              if (entry.id !== reservation.id) {
                return entry
              }

              return payload.reservation as Reservation
            })
          })
        }
      } catch (error) {
        setReservations((currentReservations) => {
          return currentReservations.map((entry) => {
            if (entry.id !== reservation.id) {
              return entry
            }

            return snapshot
          })
        })

        const message =
          error instanceof Error
            ? error.message
            : "Nem sikerült frissíteni a foglalást."
        toast.error("Foglalások", {
          description: message,
        })
      } finally {
        setUpdatingReservationId(null)
      }
    },
    [reservations, updatingReservationId]
  )

  const handleAdjustQuantity = useCallback(
    async (reservation: Reservation, delta: number) => {
      if (delta === 0) {
        return
      }

      setEditingReservationId(null)
      setEditingReservationValue("")

      const currentQuantity = normalizeNumber(reservation.quantity)
      await updateReservationQuantity(
        reservation,
        currentQuantity + delta
      )
    },
    [updateReservationQuantity]
  )

  const beginEditQuantity = useCallback(
    (reservationId: string, currentQuantity: number) => {
      setEditingReservationId(reservationId)
      setEditingReservationValue(
        String(Math.max(0, Math.trunc(currentQuantity)))
      )
    },
    []
  )

  const cancelEditQuantity = useCallback(() => {
    setEditingReservationId(null)
    setEditingReservationValue("")
  }, [])

  const commitEditQuantity = useCallback(
    async (reservation: Reservation) => {
      if (editingReservationId !== reservation.id) {
        return
      }

      const parsedValue = Number(editingReservationValue)
      if (!Number.isFinite(parsedValue)) {
        toast.error("Foglalások", {
          description: "Adj meg egy érvényes mennyiséget.",
        })
        return
      }

      cancelEditQuantity()
      await updateReservationQuantity(reservation, parsedValue)
    },
    [
      cancelEditQuantity,
      editingReservationId,
      editingReservationValue,
      updateReservationQuantity,
    ]
  )

  const handleQuantityInputKeyDown = useCallback(
    (
      event: KeyboardEvent<HTMLInputElement>,
      reservation: Reservation
    ) => {
      if (event.key === "Enter") {
        event.preventDefault()
        void commitEditQuantity(reservation)
      }

      if (event.key === "Escape") {
        event.preventDefault()
        cancelEditQuantity()
      }
    },
    [cancelEditQuantity, commitEditQuantity]
  )

  useEffect(() => {
    void loadReservations()
  }, [loadReservations])

  return (
    <div className="flex flex-col gap-y-4">
      <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-6 shadow-card-rest">
        <div className="flex flex-col gap-y-1">
          <Text size="large" weight="plus">
            Foglalások kezelő
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Foglalt mennyiségek módosítása közvetlenül a listában.
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
              placeholder="Keresés SKU, leírás vagy azonosító alapján"
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
                <th className="py-3 pr-4 font-normal">SKU</th>
                <th className="py-3 pr-4 font-normal">Leírás</th>
                <th className="py-3 pr-4 font-normal">Létrehozva</th>
                <th className="py-3 pr-4 font-normal">Mennyiség</th>
              </tr>
            </thead>
            <tbody>
              {loadingReservations ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-6 text-ui-fg-subtle"
                  >
                    Betöltés...
                  </td>
                </tr>
              ) : filteredReservations.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-6 text-ui-fg-subtle"
                  >
                    Nincs találat.
                  </td>
                </tr>
              ) : (
                filteredReservations.map((reservation) => {
                  const quantity = normalizeNumber(
                    reservation.quantity
                  )
                  const rowIsUpdating =
                    updatingReservationId === reservation.id
                  const rowIsEditing =
                    editingReservationId === reservation.id

                  return (
                    <tr
                      key={reservation.id}
                      className="border-b border-ui-border-base/60"
                    >
                      <td className="py-3 pr-4">
                        {resolveReservationSku(reservation)}
                      </td>
                      <td className="py-3 pr-4">
                        {resolveReservationDescription(reservation)}
                      </td>
                      <td className="py-3 pr-4">
                        {formatDate(reservation.created_at)}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="small"
                            variant="secondary"
                            disabled={
                              Boolean(updatingReservationId) ||
                              rowIsUpdating ||
                              quantity <= 0
                            }
                            onClick={() =>
                              void handleAdjustQuantity(
                                reservation,
                                -1
                              )
                            }
                          >
                            -
                          </Button>
                          {rowIsEditing ? (
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={editingReservationValue}
                              disabled={Boolean(updatingReservationId)}
                              onChange={(
                                event: ChangeEvent<HTMLInputElement>
                              ) =>
                                setEditingReservationValue(
                                  event.target.value
                                )
                              }
                              onBlur={() => {
                                void commitEditQuantity(reservation)
                              }}
                              onKeyDown={(
                                event: KeyboardEvent<HTMLInputElement>
                              ) =>
                                handleQuantityInputKeyDown(
                                  event,
                                  reservation
                                )
                              }
                              className="h-8 w-20 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-center text-sm"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              className="inline-flex min-w-12 justify-center rounded-md border border-ui-border-base px-2 py-1 text-sm hover:bg-ui-bg-subtle"
                              disabled={
                                Boolean(updatingReservationId) ||
                                rowIsUpdating
                              }
                              onClick={() =>
                                beginEditQuantity(
                                  reservation.id,
                                  quantity
                                )
                              }
                            >
                              {quantity}
                            </button>
                          )}
                          <Button
                            type="button"
                            size="small"
                            variant="secondary"
                            disabled={
                              Boolean(updatingReservationId) ||
                              rowIsUpdating
                            }
                            onClick={() =>
                              void handleAdjustQuantity(reservation, 1)
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
              ? `${filteredReservations.length} találat ezen az oldalon`
              : count > 0
                ? `${offset + 1}-${Math.min(offset + reservations.length, count)} / ${count}`
                : "0 / 0"}
          </Text>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="small"
              disabled={offset <= 0 || loadingReservations}
              onClick={() => {
                setOffset((current: number) =>
                  Math.max(0, current - limit)
                )
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
              disabled={
                offset + reservations.length >= count ||
                loadingReservations
              }
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
  label: "Foglalások kezelő",
  nested: "/inventory",
})

export default ReservationsQuickPage
