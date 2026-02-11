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
  display_id?: number | string | null
  created_at?: string | null
  email?: string | null
  metadata?: Record<string, unknown> | null
  fulfillments?: FulfillmentSummary[] | null
}

type BillingoDocumentSummary = {
  id: number
  invoice_number?: string | null
  public_url?: string | null
  created_at?: string | null
}

type BillingoStatusSummary = {
  status?: "pending" | "success" | "failed" | null
  errorMessage?: string | null
  errorAt?: string | null
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

type GlsLogEntry = {
  timestamp: string | null
  action: string
  status: "success" | "warning" | "error" | "info"
  message?: string | null
  errors?: string[]
  request?: Record<string, unknown> | null
  response?: unknown
  details?: Record<string, unknown> | null
  source?: string | null
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

const isRecord = (
  value: unknown
): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const readBillingoDocument = (
  metadata: Record<string, unknown> | null | undefined,
  type: "invoice" | "receipt"
): BillingoDocumentSummary | null => {
  if (!metadata || !isRecord(metadata)) {
    return null
  }

  const key =
    type === "invoice" ? "billingo_invoice" : "billingo_receipt"
  const value = metadata[key]
  if (!isRecord(value)) {
    return null
  }

  const id =
    typeof value.id === "number" && Number.isFinite(value.id)
      ? value.id
      : null
  if (!id) {
    return null
  }

  const invoiceNumber =
    typeof value.invoice_number === "string"
      ? value.invoice_number.trim()
      : null
  const publicUrl =
    typeof value.public_url === "string" ? value.public_url.trim() : null
  const createdAt =
    typeof value.created_at === "string" ? value.created_at.trim() : null

  return {
    id,
    invoice_number: invoiceNumber || undefined,
    public_url: publicUrl || undefined,
    created_at: createdAt || undefined,
  }
}

const readBillingoStatus = (
  metadata: Record<string, unknown> | null | undefined,
  type: "invoice" | "receipt"
): BillingoStatusSummary => {
  if (!metadata || !isRecord(metadata)) {
    return {}
  }

  const statusKey =
    type === "invoice"
      ? "billingo_invoice_status"
      : "billingo_receipt_status"
  const errorKey =
    type === "invoice"
      ? "billingo_invoice_error"
      : "billingo_receipt_error"

  const rawStatus = metadata[statusKey]
  const status =
    rawStatus === "pending" ||
    rawStatus === "success" ||
    rawStatus === "failed"
      ? rawStatus
      : null

  const rawError = metadata[errorKey]
  if (typeof rawError === "string") {
    return { status, errorMessage: rawError }
  }
  if (isRecord(rawError)) {
    return {
      status,
      errorMessage:
        typeof rawError.message === "string" ? rawError.message : null,
      errorAt: typeof rawError.at === "string" ? rawError.at : null,
    }
  }

  return { status }
}

const AUTO_BILLINGO_GRACE_MS = 5 * 60 * 1000

const normalizeLogStatus = (
  value: unknown
): GlsLogEntry["status"] => {
  if (value === "success" || value === "warning") {
    return value
  }
  if (value === "error" || value === "info") {
    return value
  }
  return "info"
}

const parseLogEntry = (value: unknown): GlsLogEntry | null => {
  if (!isRecord(value)) {
    return null
  }

  const timestamp =
    typeof value.timestamp === "string" ? value.timestamp : null
  const action =
    typeof value.action === "string" && value.action.trim().length
      ? value.action.trim()
      : "event"
  const status = normalizeLogStatus(value.status)
  const message =
    typeof value.message === "string" && value.message.trim().length
      ? value.message.trim()
      : null
  const errors = Array.isArray(value.errors)
    ? value.errors.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0
      )
    : undefined
  const request = isRecord(value.request) ? value.request : null
  const response = value.response ?? null
  const details = isRecord(value.details) ? value.details : null
  const source =
    typeof value.source === "string" && value.source.trim().length
      ? value.source.trim()
      : null

  return {
    timestamp,
    action,
    status,
    message,
    ...(errors?.length ? { errors } : {}),
    ...(request ? { request } : {}),
    response,
    ...(details ? { details } : {}),
    ...(source ? { source } : {}),
  }
}

const parseGlsLogEntries = (
  shipment: Record<string, unknown> | null
) => {
  if (!shipment) {
    return [] as GlsLogEntry[]
  }

  const rawLog = shipment.log
  const entries = Array.isArray(rawLog)
    ? (rawLog
        .map(parseLogEntry)
        .filter(Boolean) as GlsLogEntry[])
    : []

  if (entries.length) {
    return entries.slice().reverse()
  }

  const legacyEntries: GlsLogEntry[] = []
  const request = isRecord(shipment.request) ? shipment.request : null
  const response = shipment.response ?? null
  if (request || response) {
    legacyEntries.push({
      timestamp:
        typeof shipment.created_at === "string"
          ? shipment.created_at
          : null,
      action: "create_shipment",
      status: "info",
      message: "Legacy GLS shipment data.",
      request,
      response,
    })
  }

  const deleteRequest = isRecord(shipment.delete_request)
    ? shipment.delete_request
    : null
  const deleteResponse = shipment.delete_response ?? null
  if (deleteRequest || deleteResponse) {
    const cancelledAt =
      typeof shipment.cancelled_at === "string"
        ? shipment.cancelled_at
        : null
    legacyEntries.push({
      timestamp: cancelledAt,
      action: "cancel_label",
      status: cancelledAt ? "success" : "warning",
      message: "Legacy GLS cancellation data.",
      request: deleteRequest,
      response: deleteResponse,
    })
  }

  return legacyEntries
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

const resolveLogStatusColor = (
  status: GlsLogEntry["status"]
): "red" | "green" | "orange" | "grey" => {
  if (status === "success") {
    return "green"
  }

  if (status === "warning") {
    return "orange"
  }

  if (status === "error") {
    return "red"
  }

  return "grey"
}

const formatLogTimestamp = (value: string | null) => {
  if (!value) {
    return "Unknown time"
  }

  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return value
  }

  return new Date(parsed).toLocaleString()
}

const safeStringify = (value: unknown) => {
  if (value === null || value === undefined) {
    return ""
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const fetchOrder = async (orderId: string) => {
  const params = new URLSearchParams({
    fields: "id,display_id,created_at,email,metadata,fulfillments.*",
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
  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [fulfillment, setFulfillment] =
    useState<FulfillmentSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [recreating, setRecreating] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [parcelStatuses, setParcelStatuses] = useState<
    ParcelStatusSummary[]
  >([])
  const [autoCreateAttempted, setAutoCreateAttempted] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [billingoDownloading, setBillingoDownloading] = useState<
    "invoice" | null
  >(null)
  const [billingoCreating, setBillingoCreating] = useState<
    "invoice" | null
  >(null)
  const [billingoEmailing, setBillingoEmailing] = useState<
    "invoice" | null
  >(null)
  const prompt = usePrompt()

  useEffect(() => {
    setOrderId(resolveOrderId())
  }, [])

  const loadOrder = useCallback(async (options?: { silent?: boolean }) => {
    if (!orderId) {
      return
    }

    if (!options?.silent) {
      setLoading(true)
    }
    try {
      const order = await fetchOrder(orderId)
      setOrder(order)
      setFulfillment(pickGlsFulfillment(order.fulfillments) ?? null)
      return order
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load order."
      if (!options?.silent) {
        toast.error("GLS shipment", {
          description: message,
          action: {
            label: "Copy",
            altText: "Copy GLS error",
            onClick: () => void copyToClipboard(message),
          },
        })
      }
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
      setHasLoadedOnce(true)
    }
  }, [orderId])

  useEffect(() => {
    void loadOrder()
  }, [loadOrder])

  const billingoInvoice = useMemo(
    () => readBillingoDocument(order?.metadata, "invoice"),
    [order?.metadata]
  )

  const shipment = useMemo(
    () => readGlsShipment(fulfillment?.metadata),
    [fulfillment]
  )
  const shouldPoll = Boolean(orderId) && (!fulfillment || !shipment)

  useEffect(() => {
    if (!shouldPoll) {
      return
    }

    const interval = window.setInterval(() => {
      void loadOrder({ silent: true })
    }, 4000)

    return () => {
      window.clearInterval(interval)
    }
  }, [loadOrder, shouldPoll])
  const logEntries = useMemo(
    () => parseGlsLogEntries(shipment),
    [shipment]
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
    (parcelIds.length > 0 ||
      parcelNumbers.length > 0 ||
      previousParcelNumbers.length > 0 ||
      hasShipment) &&
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

  useEffect(() => {
    setAutoCreateAttempted(false)
  }, [fulfillment?.id])

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

  const handleCreate = useCallback(async (options?: { silent?: boolean }) => {
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

      if (response.status === 409) {
        return
      }

      const payload = await response.json().catch(() => ({}))
      const errors = Array.isArray(payload?.errors)
        ? payload.errors
        : []
      const errorText = errors.length ? errors.join("; ") : null

      if (!response.ok) {
        const message =
          errorText ??
          payload?.message ??
          "GLS shipment request failed. Check the logs."
        throw new Error(message)
      }

      const numbers = Array.isArray(payload?.parcel_numbers)
        ? payload.parcel_numbers.join(", ")
        : ""

      if (errors.length) {
        toast.warning("GLS returned errors", {
          description: errorText,
          action: {
            label: "Copy",
            altText: "Copy GLS error",
            onClick: () => void copyToClipboard(errorText),
          },
        })
      } else if (!options?.silent) {
        toast.success("GLS shipment created", {
          description: numbers ? `Parcel: ${numbers}` : undefined,
        })
      }
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
      await loadOrder({ silent: true })
    }
  }, [fulfillment, loadOrder])

  useEffect(() => {
    if (
      !fulfillment ||
      hasShipment ||
      isCancelled ||
      autoCreateAttempted ||
      submitting
    ) {
      return
    }

    const timer = window.setTimeout(() => {
      setAutoCreateAttempted(true)
      void (async () => {
        const order = await loadOrder({ silent: true })
        const latestFulfillment = order
          ? pickGlsFulfillment(order.fulfillments)
          : null
        const latestShipment = readGlsShipment(
          latestFulfillment?.metadata
        )

        if (latestShipment) {
          return
        }

        await handleCreate({ silent: true })
      })()
    }, 2000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    autoCreateAttempted,
    fulfillment,
    handleCreate,
    hasShipment,
    isCancelled,
    loadOrder,
    submitting,
  ])

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
        const cancelErrors = Array.isArray(cancelPayload?.errors)
          ? cancelPayload.errors
          : []
        const cancelErrorText = cancelErrors.length
          ? cancelErrors.join("; ")
          : null

        if (!cancelResponse.ok) {
          const message =
            cancelErrorText ??
            cancelPayload?.message ??
            "Failed to cancel the GLS label."
          throw new Error(message)
        }

        if (cancelErrors.length) {
          toast.warning("GLS cancellation returned errors", {
            description: cancelErrorText,
            action: {
              label: "Copy",
              altText: "Copy GLS error",
              onClick: () => void copyToClipboard(cancelErrorText),
            },
          })
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
      const createErrors = Array.isArray(createPayload?.errors)
        ? createPayload.errors
        : []
      const createErrorText = createErrors.length
        ? createErrors.join("; ")
        : null

      if (!createResponse.ok) {
        const message =
          createErrorText ??
          createPayload?.message ??
          "GLS shipment request failed. Check the logs."
        throw new Error(message)
      }

      if (createErrors.length) {
        toast.warning("GLS returned errors", {
          description: createErrorText,
          action: {
            label: "Copy",
            altText: "Copy GLS error",
            onClick: () => void copyToClipboard(createErrorText),
          },
        })
      } else {
        toast.success("GLS shipment recreated")
      }
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
      await loadOrder()
    }
  }, [
    canCancel,
    fulfillment,
    hasShipment,
    isCancelled,
    loadOrder,
  ])

  const handleBillingoDownload = useCallback(
    async (type: "invoice") => {
      if (!orderId) {
        return
      }

      setBillingoDownloading(type)
      try {
        const response = await fetch(
          `/admin/billingo/orders/${orderId}/documents/${type}`,
          {
            credentials: "include",
          }
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          const message =
            payload?.message ??
            "Failed to download the Billingo document."
          throw new Error(message)
        }

        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        const fallbackName = `szamla-${order?.display_id ?? orderId}.pdf`
        const contentDisposition =
          response.headers.get("Content-Disposition")
        const match = contentDisposition?.match(
          /filename=\"?([^\";]+)\"?/i
        )

        link.href = url
        link.download = match?.[1] ?? fallbackName
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to download the Billingo document."
        toast.error("Billingo", {
          description: message,
          action: {
            label: "Copy",
            altText: "Copy Billingo error",
            onClick: () => void copyToClipboard(message),
          },
        })
      } finally {
        setBillingoDownloading(null)
      }
    },
    [order?.display_id, orderId]
  )

  const handleBillingoCreate = useCallback(
    async (type: "invoice") => {
      if (!orderId) {
        return
      }

      setBillingoCreating(type)
      try {
        const response = await fetch(
          `/admin/billingo/orders/${orderId}/documents/${type}`,
          {
            method: "POST",
            credentials: "include",
          }
        )

        if (response.status === 409) {
          toast.warning("Billingo", {
            description: "A dokumentum már létezik ehhez a rendeléshez.",
          })
          return
        }

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          const message =
            payload?.message ??
            "Failed to create the Billingo document."
          throw new Error(message)
        }

        toast.success("Billingo", {
          description: "Számla létrehozva.",
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to create the Billingo document."
        toast.error("Billingo", {
          description: message,
          action: {
            label: "Copy",
            altText: "Copy Billingo error",
            onClick: () => void copyToClipboard(message),
          },
        })
      } finally {
        setBillingoCreating(null)
        await loadOrder({ silent: true })
      }
    },
    [orderId, loadOrder]
  )

  const handleBillingoEmail = useCallback(
    async (type: "invoice") => {
    if (!orderId) {
      return
    }

    setBillingoEmailing(type)
    try {
      const response = await fetch(
        `/admin/billingo/orders/${orderId}/documents/${type}/email`,
        {
          method: "POST",
          credentials: "include",
        }
      )

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message =
          payload?.message ??
          "Failed to send the Billingo invoice email."
        throw new Error(message)
      }

      toast.success("Billingo", {
          description: "A számla e-mail elküldve.",
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to send the Billingo email."
      toast.error("Billingo", {
        description: message,
        action: {
          label: "Copy",
          altText: "Copy Billingo error",
          onClick: () => void copyToClipboard(message),
        },
      })
    } finally {
      setBillingoEmailing(null)
      await loadOrder({ silent: true })
    }
  },
    [orderId, loadOrder]
  )

  const handleOpenBillingoUrl = useCallback((url?: string | null) => {
    if (!url) {
      return
    }

    window.open(url, "_blank", "noopener,noreferrer")
  }, [])

  if (!orderId || (!hasLoadedOnce && loading)) {
    return null
  }

  const renderBillingoCard = (
    document: BillingoDocumentSummary | null
  ) => {
    const type = "invoice" as const
    const isAvailable = Boolean(document?.id)
    const statusLabel = isAvailable ? "Elkészült" : "Nincs"
    const statusColor = isAvailable ? "green" : "grey"
    const billingoStatus = readBillingoStatus(order?.metadata, type)
    const createdAtMs = order?.created_at
      ? Date.parse(order.created_at)
      : Number.NaN
    const legacyWindowElapsed =
      Number.isNaN(createdAtMs) ||
      Date.now() - createdAtMs > AUTO_BILLINGO_GRACE_MS
    const autoFailed =
      billingoStatus.status === "failed" ||
      Boolean(billingoStatus.errorMessage)
    const autoPending = billingoStatus.status === "pending"
    const autoSuccessMissing = billingoStatus.status === "success"
    const showManualActions =
      !isAvailable && (autoFailed || autoSuccessMissing || legacyWindowElapsed)

    return (
      <div className="rounded-md border border-ui-border-base bg-ui-bg-base p-3">
        <div className="flex items-center justify-between">
          <Text size="xsmall" weight="plus">
            Számla
          </Text>
          <StatusBadge color={statusColor}>{statusLabel}</StatusBadge>
        </div>
        {isAvailable ? (
          <div className="mt-2 flex flex-col gap-y-2">
            {document?.invoice_number ? (
              <Text size="xsmall" className="text-ui-fg-subtle">
                Azonosító: {document.invoice_number}
              </Text>
            ) : null}
            {document?.created_at ? (
              <Text size="xsmall" className="text-ui-fg-subtle">
                Létrehozva: {formatLogTimestamp(document.created_at)}
              </Text>
            ) : null}
            <Button
              size="small"
              variant="secondary"
              className="w-full"
              onClick={() => void handleBillingoDownload(type)}
              isLoading={billingoDownloading === type}
              disabled={billingoDownloading === type}
            >
              PDF letöltése
            </Button>
            <Button
              size="small"
              variant="secondary"
              className="w-full"
              onClick={() => void handleBillingoEmail(type)}
              isLoading={billingoEmailing === type}
              disabled={billingoEmailing === type || !order?.email}
            >
              Számla e-mail
            </Button>
            {document?.public_url ? (
              <Button
                size="small"
                variant="secondary"
                className="w-full"
                onClick={() => handleOpenBillingoUrl(document.public_url)}
              >
                Megnyitás
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-y-2">
            <Text size="xsmall" className="text-ui-fg-subtle">
              A Billingo dokumentum még nem elérhető.
            </Text>
            {showManualActions ? (
              <>
                {billingoStatus.errorMessage ? (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Hiba: {billingoStatus.errorMessage}
                    {billingoStatus.errorAt
                      ? ` (${formatLogTimestamp(billingoStatus.errorAt)})`
                      : ""}
                  </Text>
                ) : null}
                <Button
                  size="small"
                  variant="secondary"
                  className="w-full"
                  onClick={() => void handleBillingoCreate(type)}
                  isLoading={billingoCreating === type}
                  disabled={billingoCreating === type}
                >
                  Létrehozás
                </Button>
                <Button
                  size="small"
                  variant="secondary"
                  className="w-full"
                  onClick={() => void handleBillingoEmail(type)}
                  isLoading={billingoEmailing === type}
                  disabled={billingoEmailing === type || !order?.email}
                >
                  Számla e-mail
                </Button>
              </>
            ) : (
              <>
                {autoPending ? (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Automatikus létrehozás folyamatban. Kérlek frissíts.
                  </Text>
                ) : (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Automatikus létrehozás folyamatban. Kérlek frissíts.
                  </Text>
                )}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-y-4">
      <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4 shadow-card-rest">
        <div className="flex items-center justify-between">
          <Text size="small" weight="plus">
            Billingo
          </Text>
          <div className="flex items-center gap-x-2">
            {billingoInvoice ? (
              <StatusBadge color="green">Számla</StatusBadge>
            ) : null}
            {!billingoInvoice ? (
              <StatusBadge color="grey">Nincs dokumentum</StatusBadge>
            ) : null}
            <Button
              size="small"
              variant="secondary"
              onClick={() => void loadOrder({ silent: false })}
              isLoading={loading}
              disabled={loading}
            >
              Frissítés
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-y-3">
          {renderBillingoCard(billingoInvoice)}
        </div>
      </div>

      {fulfillment ? (
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
              onClick={() => void handleCreate()}
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
          <div className="mt-4 border-t border-ui-border-base pt-3">
            <div className="flex items-center justify-between">
              <Text size="small" weight="plus">
                GLS log
              </Text>
              <Button
                size="small"
                variant="secondary"
                onClick={() => setLogOpen((prev) => !prev)}
                disabled={!logEntries.length}
              >
                {logOpen ? "Hide log" : "View log"}
              </Button>
            </div>
            {!logEntries.length ? (
              <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
                No GLS log entries yet.
              </Text>
            ) : null}
            {logOpen ? (
              <div className="mt-3 flex flex-col gap-y-2">
                {logEntries.map((entry, index) => (
                  <div
                    key={`${entry.timestamp ?? "unknown"}-${index}`}
                    className="rounded-md border border-ui-border-base bg-ui-bg-base p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Text size="xsmall" weight="plus">
                        {formatLogTimestamp(entry.timestamp)}
                        {entry.action ? ` - ${entry.action}` : ""}
                      </Text>
                      <div className="flex items-center gap-x-2">
                        {entry.source ? (
                          <Text
                            size="xsmall"
                            className="text-ui-fg-subtle"
                          >
                            {entry.source}
                          </Text>
                        ) : null}
                        <StatusBadge
                          color={resolveLogStatusColor(entry.status)}
                        >
                          {entry.status}
                        </StatusBadge>
                      </div>
                    </div>
                    {entry.message ? (
                      <Text
                        size="xsmall"
                        className="mt-1 text-ui-fg-subtle"
                      >
                        {entry.message}
                      </Text>
                    ) : null}
                    {entry.errors?.length ? (
                      <Text
                        size="xsmall"
                        className="mt-1 text-ui-fg-subtle"
                      >
                        Errors: {entry.errors.join("; ")}
                      </Text>
                    ) : null}
                    {entry.details ? (
                      <pre className="mt-2 max-h-48 overflow-auto rounded bg-ui-bg-base p-2 text-[11px] text-ui-fg-subtle">
                        {safeStringify(entry.details)}
                      </pre>
                    ) : null}
                    {entry.request || entry.response ? (
                      <pre className="mt-2 max-h-64 overflow-auto rounded bg-ui-bg-base p-2 text-[11px] text-ui-fg-subtle">
                        {safeStringify({
                          request: entry.request ?? null,
                          response: entry.response ?? null,
                        })}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderGlsShipmentWidget
