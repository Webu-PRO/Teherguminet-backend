import { useCallback, useEffect, useMemo, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Text, toast } from "@medusajs/ui"

type FulfillmentSummary = {
  id: string
  provider_id?: string | null
  metadata?: Record<string, unknown> | null
  labels?: Array<{ tracking_number?: string | null } | null> | null
}

type OrderSummary = {
  id: string
  fulfillments?: FulfillmentSummary[] | null
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

const pickGlsFulfillment = (fulfillments?: FulfillmentSummary[] | null) => {
  if (!Array.isArray(fulfillments)) {
    return null
  }

  return fulfillments.find((fulfillment) =>
    isGlsProvider(fulfillment.provider_id)
  )
}

const readGlsShipment = (metadata?: Record<string, unknown> | null) => {
  if (!metadata || typeof metadata !== "object") {
    return null
  }

  const shipment = metadata.gls_shipment
  return shipment && typeof shipment === "object" ? shipment : null
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
      setFulfillment(pickGlsFulfillment(order.fulfillments))
    } catch (error) {
      toast.error("GLS shipment", {
        description:
          error instanceof Error
            ? error.message
            : "Failed to load order.",
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
  const hasShipment = Boolean(shipment)
  const hasParcelNumbers = parcelNumbers.length > 0
  const isLocked = hasShipment && hasParcelNumbers

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
        toast.warning("GLS returned errors", {
          description: payload.errors.join("; "),
        })
      } else {
        toast.success("GLS shipment created", {
          description: numbers ? `Parcel: ${numbers}` : undefined,
        })
      }

      await loadOrder()
    } catch (error) {
      toast.error("GLS shipment", {
        description:
          error instanceof Error
            ? error.message
            : "GLS shipment request failed.",
      })
    } finally {
      setSubmitting(false)
    }
  }, [fulfillment, loadOrder])

  if (!orderId || loading || !fulfillment) {
    return null
  }

  return (
    <div className="flex flex-col gap-y-2">
      <Text size="small" weight="plus">
        GLS
      </Text>
      <Button
        size="small"
        variant="secondary"
        onClick={handleCreate}
        isLoading={submitting}
        disabled={isLocked}
      >
        {isLocked ? "GLS shipment created" : "Create GLS shipment"}
      </Button>
      {parcelNumbers.length ? (
        <Text size="xsmall">Parcel: {parcelNumbers.join(", ")}</Text>
      ) : null}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderGlsShipmentWidget
