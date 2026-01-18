import { useCallback, useEffect, useMemo, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  Button,
  StatusBadge,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"

type FulfillmentSummary = {
  id: string
  provider_id?: string | null
  created_at?: string | null
  metadata?: Record<string, unknown> | null
  labels?: Array<{ tracking_number?: string | null } | null> | null
}

type OrderSummary = {
  id: string
  fulfillments?: FulfillmentSummary[] | null
}

type ParcelStatusSummary = {
  parcel_number: string
  status?: {
    code?: string
    description?: string
    date?: string
    info?: string
    depot_city?: string
    depot_number?: string
  }
  errors?: string[]
}

const resolveOrderId = () => {
  if (typeof window === "undefined") {
    return null
  }

  const parts = window.location.pathname.split("/orders/")
  if (parts.length < 2) {
    return null
  }

  const idPart = parts[1]?.split("/")[0]
  return idPart || null
}

const isGlsProvider = (value?: string | null) =>
  typeof value === "string" && value.toLowerCase().includes("gls")

const readGlsShipment = (
  metadata?: Record<string, unknown> | null
) => {
  if (!metadata || typeof metadata !== "object") {
    return null
  }

  const shipment = metadata.gls_shipment
  if (!shipment || typeof shipment !== "object") {
    return null
  }

  return shipment as Record<string, unknown>
}

const isShipmentCancelled = (
  fulfillment: FulfillmentSummary
) => {
  const shipment = readGlsShipment(fulfillment.metadata)
  if (!shipment) {
    return false
  }

  return typeof shipment.cancelled_at === "string"
}

const parseCreatedAt = (value?: string | null) => {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

const pickGlsFulfillment = (fulfillments?: FulfillmentSummary[] | null) => {
  if (!Array.isArray(fulfillments)) {
    return null
  }

  const glsFulfillments = fulfillments
    .map((fulfillment, index) => ({
      fulfillment,
      index,
      createdAt: parseCreatedAt(fulfillment.created_at),
    }))
    .filter(({ fulfillment }) => isGlsProvider(fulfillment.provider_id))

  if (!glsFulfillments.length) {
    return null
  }

  glsFulfillments.sort((a, b) => {
    const aTime = a.createdAt ?? 0
    const bTime = b.createdAt ?? 0
    if (aTime !== bTime) {
      return bTime - aTime
    }

    return b.index - a.index
  })

  const active = glsFulfillments.find(
    ({ fulfillment }) => !isShipmentCancelled(fulfillment)
  )

  return active?.fulfillment ?? glsFulfillments[0].fulfillment
}

const parseParcelNumbers = (shipment: Record<string, unknown> | null) => {
  if (!shipment) {
    return []
  }

  const numbers = shipment.parcel_numbers
  if (!Array.isArray(numbers)) {
    return []
  }

  return numbers.filter((value): value is string => typeof value === "string")
}

const parsePreviousParcelNumbers = (
  shipment: Record<string, unknown> | null
) => {
  if (!shipment) {
    return []
  }

  const numbers = shipment.previous_parcel_numbers
  if (!Array.isArray(numbers)) {
    return []
  }

  const parsed: string[] = []
  const seen = new Set<string>()

  for (const value of numbers) {
    if (typeof value !== "string") {
      continue
    }

    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }

    seen.add(trimmed)
    parsed.push(trimmed)
  }

  return parsed
}

const parseParcelIds = (shipment: Record<string, unknown> | null) => {
  if (!shipment) {
    return []
  }

  const ids = shipment.parcel_ids
  if (!Array.isArray(ids)) {
    return []
  }

  return ids.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value)
  )
}

const readLabelBase64 = (shipment: Record<string, unknown> | null) => {
  if (!shipment) {
    return null
  }

  const value = shipment.label_base64
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return trimmed
}

const readCancelledAt = (shipment: Record<string, unknown> | null) => {
  if (!shipment) {
    return null
  }

  const value = shipment.cancelled_at
  return typeof value === "string" ? value : null
}

const copyToClipboard = async (value: string) => {
  if (!value) {
    return
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText
  ) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  document.execCommand("copy")
  document.body.removeChild(textarea)
}

const resolveParcelStatusColor = (value: string) => {
  const normalized = value.toLowerCase()

  if (
    normalized.includes("return") ||
    normalized.includes("cancel") ||
    normalized.includes("fail") ||
    normalized.includes("exception") ||
    normalized.includes("unsuccess")
  ) {
    return "red"
  }

  if (
    normalized.includes("delivered") ||
    normalized.includes("success")
  ) {
    return "green"
  }

  if (
    normalized.includes("transit") ||
    normalized.includes("pickup") ||
    normalized.includes("out for delivery")
  ) {
    return "orange"
  }

  return "grey"
}

const fetchOrder = async (orderId: string) => {
  const params = new URLSearchParams({
    fields: "id,fulfillments.*",
  })

  const response = await fetch(
    `/admin/orders/${orderId}?${params.toString()}`,
    {
      credentials: "include",
    }
  )

  if (!response.ok) {
    throw new Error("Failed to load order details.")
  }

  const payload = (await response.json()) as { order?: OrderSummary }
  if (!payload?.order) {
    throw new Error("Order not found.")
  }

  return payload.order
}

const OrderGlsShipmentWidget = () => {
  const [orderId, setOrderId] = useState<string | null>(null)
  const [fulfillment, setFulfillment] =
    useState<FulfillmentSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [recreating, setRecreating] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [parcelStatuses, setParcelStatuses] = useState<
    ParcelStatusSummary[]
  >([])
  const prompt = usePrompt()

  useEffect(() => {
    setOrderId(resolveOrderId())
  }, [])

  const loadOrder = useCallback(async () => {
    if (!orderId) {
      return
    }

    setLoading(true)
    try {
      const order = await fetchOrder(orderId)
      setFulfillment(pickGlsFulfillment(order.fulfillments) ?? null)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load order."
      toast.error("GLS shipment", {
        description: message,
        action: {
          label: "Copy",
          altText: "Copy GLS error",
          onClick: () => void copyToClipboard(message),
        },
      })
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void loadOrder()
  }, [loadOrder])

  const shipment = useMemo(
    () => readGlsShipment(fulfillment?.metadata),
    [fulfillment]
  )
  const parcelNumbers = useMemo(
    () => parseParcelNumbers(shipment),
    [shipment]
  )
  const previousParcelNumbers = useMemo(() => {
    const parsed = parsePreviousParcelNumbers(shipment)
    if (!parsed.length) {
      return []
    }

    if (!parcelNumbers.length) {
      return parsed
    }

    const current = new Set(parcelNumbers)
    return parsed.filter((value) => !current.has(value))
  }, [parcelNumbers, shipment])
  const parcelIds = useMemo(
    () => parseParcelIds(shipment),
    [shipment]
  )
  const labelBase64 = useMemo(
    () => readLabelBase64(shipment),
    [shipment]
  )
  const cancelledAt = useMemo(
    () => readCancelledAt(shipment),
    [shipment]
  )
  const parcelNumbersKey = useMemo(
    () => parcelNumbers.join("|"),
    [parcelNumbers]
  )
  const hasShipment = Boolean(shipment)
  const hasParcelNumbers = parcelNumbers.length > 0
  const isCancelled = Boolean(cancelledAt)
  const hasCreatedLabel =
    hasParcelNumbers ||
    parcelIds.length > 0 ||
    Boolean(labelBase64)
  const isLocked = hasShipment && hasParcelNumbers && !isCancelled
  const hasLabel = Boolean(labelBase64) && !isCancelled
  const canCancel =
    (parcelIds.length > 0 || parcelNumbers.length > 0) &&
    !isCancelled
  const canRecreate = hasCreatedLabel && !recreating

  const statusLabel = isCancelled
    ? "Cancelled"
    : hasShipment
      ? hasParcelNumbers
        ? "Shipment created"
        : "Pending label"
      : "Not created"
  const statusColor: "red" | "green" | "orange" | "grey" =
    isCancelled
      ? "red"
      : hasParcelNumbers
        ? "green"
        : hasShipment
          ? "orange"
          : "grey"

  const parcelStatusBadge = useMemo(() => {
    if (isCancelled || !parcelNumbers.length) {
      return null
    }

    if (statusLoading) {
      return { label: "Fetching status", color: "orange" as const }
    }

    if (statusError) {
      return { label: "Status unavailable", color: "red" as const }
    }

    if (!parcelStatuses.length) {
      return { label: "Status pending", color: "grey" as const }
    }

    const labels = parcelStatuses
      .map((entry) => entry.status?.description ?? entry.status?.code)
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim())
      .filter(Boolean)
    const uniqueLabels = Array.from(new Set(labels))
    const total = parcelStatuses.length
    const hasErrors = parcelStatuses.some(
      (entry) => entry.errors?.length
    )

    if (!uniqueLabels.length) {
      return {
        label: hasErrors ? "Status unavailable" : "Status pending",
        color: hasErrors ? ("red" as const) : ("grey" as const),
      }
    }

    if (uniqueLabels.length === 1) {
      const baseLabel = uniqueLabels[0]
      const suffix = total > 1 ? ` (${total})` : ""
      return {
        label: `${baseLabel}${suffix}`,
        color: resolveParcelStatusColor(baseLabel) as
          | "red"
          | "green"
          | "orange"
          | "grey",
      }
    }

    return {
      label: `Multiple statuses (${total})`,
      color: "orange" as const,
    }
  }, [
    isCancelled,
    parcelNumbers.length,
    parcelStatuses,
    statusError,
    statusLoading,
  ])

  const loadParcelStatuses = useCallback(async () => {
    if (!fulfillment || !parcelNumbers.length || isCancelled) {
      setParcelStatuses([])
      setStatusError(null)
      setStatusLoading(false)
      return
    }

    setStatusLoading(true)
    setStatusError(null)

    try {
      const response = await fetch(
        `/admin/gls/fulfillments/${fulfillment.id}/statuses`,
        {
          credentials: "include",
        }
      )

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message =
          payload?.message ??
          "Failed to fetch GLS parcel statuses."
        throw new Error(message)
      }

      const statuses = Array.isArray(payload?.statuses)
        ? (payload.statuses as ParcelStatusSummary[])
        : []
      setParcelStatuses(statuses)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to fetch GLS parcel statuses."
      setParcelStatuses([])
      setStatusError(message)
    } finally {
      setStatusLoading(false)
    }
  }, [fulfillment, isCancelled, parcelNumbers.length, parcelNumbersKey])

  useEffect(() => {
    void loadParcelStatuses()
  }, [loadParcelStatuses])

  const handleCreate = useCallback(async () => {
    if (!fulfillment) {
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(
        `/admin/gls/fulfillments/${fulfillment.id}`,
        {
          method: "POST",
          credentials: "include",
        }
      )

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message =
          payload?.message ??
          "GLS shipment request failed. Check the logs."
        throw new Error(message)
      }

      const numbers = Array.isArray(payload?.parcel_numbers)
        ? payload.parcel_numbers.join(", ")
        : ""

      if (Array.isArray(payload?.errors) && payload.errors.length) {
        const errorText = payload.errors.join("; ")
        toast.warning("GLS returned errors", {
          description: errorText,
          action: {
            label: "Copy",
            altText: "Copy GLS error",
            onClick: () => void copyToClipboard(errorText),
          },
        })
      } else {
        toast.success("GLS shipment created", {
          description: numbers ? `Parcel: ${numbers}` : undefined,
        })
      }

      await loadOrder()
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "GLS shipment request failed."
      toast.error("GLS shipment", {
        description: message,
        action: {
          label: "Copy",
          altText: "Copy GLS error",
          onClick: () => void copyToClipboard(message),
        },
      })
    } finally {
      setSubmitting(false)
    }
  }, [fulfillment, loadOrder])

  const handleDownload = useCallback(async () => {
    if (!fulfillment) {
      return
    }

    setDownloading(true)
    try {
      const response = await fetch(
        `/admin/gls/fulfillments/${fulfillment.id}`,
        {
          credentials: "include",
        }
      )

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const message =
          payload?.message ??
          "Failed to download the GLS label."
        throw new Error(message)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `gls-label-${orderId ?? fulfillment.id}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to download the GLS label."
      toast.error("GLS label", {
        description: message,
        action: {
          label: "Copy",
          altText: "Copy GLS error",
          onClick: () => void copyToClipboard(message),
        },
      })
    } finally {
      setDownloading(false)
    }
  }, [fulfillment, orderId])

  const handleCancel = useCallback(async () => {
    if (!fulfillment) {
      return
    }

    const confirmed = await prompt({
      title: "Cancel GLS label?",
      description: "This will invalidate the label in GLS.",
      variant: "danger",
      confirmText: "Cancel label",
      cancelText: "Keep label",
    })

    if (!confirmed) {
      return
    }

    setCanceling(true)
    try {
      const response = await fetch(
        `/admin/gls/fulfillments/${fulfillment.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      )

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message =
          payload?.message ??
          "Failed to cancel the GLS label."
        throw new Error(message)
      }

      if (Array.isArray(payload?.errors) && payload.errors.length) {
        const errorText = payload.errors.join("; ")
        toast.warning("GLS cancellation returned errors", {
          description: errorText,
          action: {
            label: "Copy",
            altText: "Copy GLS error",
            onClick: () => void copyToClipboard(errorText),
          },
        })
      } else {
        toast.success("GLS label cancelled")
      }

      await loadOrder()
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to cancel the GLS label."
      toast.error("GLS label", {
        description: message,
        action: {
          label: "Copy",
          altText: "Copy GLS error",
          onClick: () => void copyToClipboard(message),
        },
      })
    } finally {
      setCanceling(false)
    }
  }, [fulfillment, loadOrder])

  const handleRecreate = useCallback(async () => {
    if (!fulfillment) {
      return
    }

    const confirmed = await prompt({
      title: "Recreate GLS label?",
      description:
        "This will cancel the current label and request a new one.",
      variant: "confirmation",
      confirmText: "Recreate label",
      cancelText: "Cancel",
    })

    if (!confirmed) {
      return
    }

    setRecreating(true)
    try {
      if (canCancel) {
        const cancelResponse = await fetch(
          `/admin/gls/fulfillments/${fulfillment.id}`,
          {
            method: "DELETE",
            credentials: "include",
          }
        )

        const cancelPayload = await cancelResponse
          .json()
          .catch(() => ({}))

        if (!cancelResponse.ok) {
          const message =
            cancelPayload?.message ??
            "Failed to cancel the GLS label."
          throw new Error(message)
        }

        if (
          Array.isArray(cancelPayload?.errors) &&
          cancelPayload.errors.length
        ) {
          const errorText = cancelPayload.errors.join("; ")
          toast.warning("GLS cancellation returned errors", {
            description: errorText,
            action: {
              label: "Copy",
              altText: "Copy GLS error",
              onClick: () => void copyToClipboard(errorText),
            },
          })
          await loadOrder()
          return
        }
      } else if (hasShipment && !isCancelled) {
        throw new Error(
          "GLS parcel IDs are missing. Recreate is not possible for older labels."
        )
      }

      const createResponse = await fetch(
        `/admin/gls/fulfillments/${fulfillment.id}`,
        {
          method: "POST",
          credentials: "include",
        }
      )

      const createPayload = await createResponse
        .json()
        .catch(() => ({}))

      if (!createResponse.ok) {
        const message =
          createPayload?.message ??
          "GLS shipment request failed. Check the logs."
        throw new Error(message)
      }

      if (
        Array.isArray(createPayload?.errors) &&
        createPayload.errors.length
      ) {
        const errorText = createPayload.errors.join("; ")
        toast.warning("GLS returned errors", {
          description: errorText,
          action: {
            label: "Copy",
            altText: "Copy GLS error",
            onClick: () => void copyToClipboard(errorText),
          },
        })
      } else {
        toast.success("GLS shipment recreated")
      }

      await loadOrder()
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to recreate the GLS label."
      toast.error("GLS label", {
        description: message,
        action: {
          label: "Copy",
          altText: "Copy GLS error",
          onClick: () => void copyToClipboard(message),
        },
      })
    } finally {
      setRecreating(false)
    }
  }, [
    canCancel,
    fulfillment,
    hasShipment,
    isCancelled,
    loadOrder,
  ])

  if (!orderId || loading || !fulfillment) {
    return null
  }

  return (
    <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4 shadow-card-rest">
      <div className="flex items-center justify-between">
        <Text size="small" weight="plus">
          GLS
        </Text>
        <div className="flex items-center gap-x-2">
          {parcelStatusBadge ? (
            <StatusBadge color={parcelStatusBadge.color}>
              {parcelStatusBadge.label}
            </StatusBadge>
          ) : null}
          <StatusBadge color={statusColor}>{statusLabel}</StatusBadge>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-y-2">
        <Button
          size="small"
          variant="secondary"
          className="w-full"
          onClick={handleCreate}
          isLoading={submitting}
          disabled={isLocked}
        >
          {isLocked ? "GLS shipment created" : "Create GLS shipment"}
        </Button>
        <Button
          size="small"
          variant="secondary"
          className="w-full"
          onClick={handleDownload}
          isLoading={downloading}
          disabled={!hasLabel || downloading}
        >
          Download GLS label
        </Button>
        <Button
          size="small"
          variant="secondary"
          className="w-full"
          onClick={handleCancel}
          isLoading={canceling}
          disabled={!canCancel}
        >
          Cancel GLS label
        </Button>
        <Button
          size="small"
          variant="secondary"
          className="w-full"
          onClick={handleRecreate}
          isLoading={recreating}
          disabled={!canRecreate}
        >
          Recreate GLS label
        </Button>
        {parcelNumbers.length ? (
          <Text size="xsmall" className="text-ui-fg-subtle">
            {isCancelled ? "Parcel (cancelled):" : "Parcel:"}{" "}
            {parcelNumbers.join(", ")}
          </Text>
        ) : null}
        {previousParcelNumbers.length ? (
          <Text size="xsmall" className="text-ui-fg-subtle">
            Previous parcel(s): {previousParcelNumbers.join(", ")}
          </Text>
        ) : null}
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderGlsShipmentWidget
