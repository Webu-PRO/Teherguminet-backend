import { useCallback, useMemo, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Input,
  StatusBadge,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"

type StatusPayload = {
  code?: string
  description?: string
  date?: string
  info?: string
  depot_city?: string
  depot_number?: string
}

type ParcelStatusResponse = {
  parcel_number: string
  status?: StatusPayload
  status_list?: StatusPayload[]
  errors?: string[]
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

const GlsPage = () => {
  const [parcelInput, setParcelInput] = useState("")
  const [activeParcel, setActiveParcel] = useState<string | null>(
    null
  )
  const [status, setStatus] = useState<ParcelStatusResponse | null>(
    null
  )
  const [statusError, setStatusError] = useState<string | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const prompt = usePrompt()

  const normalizedInput = useMemo(
    () => parcelInput.trim(),
    [parcelInput]
  )

  const statusLabel = useMemo(() => {
    const value =
      status?.status?.description ?? status?.status?.code
    return value?.trim() || null
  }, [status])

  const statusColor = useMemo(() => {
    if (!statusLabel) {
      return "grey" as const
    }

    return resolveParcelStatusColor(statusLabel) as
      | "red"
      | "green"
      | "orange"
      | "grey"
  }, [statusLabel])

  const loadStatus = useCallback(async (parcelNumber: string) => {
    setLoading(true)
    setStatusError(null)

    try {
      const response = await fetch(
        `/admin/gls/parcels/${encodeURIComponent(parcelNumber)}`,
        {
          credentials: "include",
        }
      )

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message =
          payload?.message ??
          "Failed to fetch GLS parcel status."
        throw new Error(message)
      }

      const parsed = payload as ParcelStatusResponse
      setStatus(parsed)
      setActiveParcel(parcelNumber)

      if (parsed.errors?.length) {
        const errorText = parsed.errors.join("; ")
        toast.warning("GLS status returned errors", {
          description: errorText,
        })
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to fetch GLS parcel status."
      setStatus(null)
      setStatusError(message)
      toast.error("GLS status", {
        description: message,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSearch = useCallback(async () => {
    if (!normalizedInput) {
      toast.error("GLS lookup", {
        description: "Enter a parcel number.",
      })
      return
    }

    await loadStatus(normalizedInput)
  }, [loadStatus, normalizedInput])

  const handleCancel = useCallback(async () => {
    if (!activeParcel) {
      toast.error("GLS cancel", {
        description: "Search for a parcel first.",
      })
      return
    }

    const confirmed = await prompt({
      title: "Cancel GLS label?",
      description: `This will invalidate GLS label ${activeParcel}.`,
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
        `/admin/gls/parcels/${encodeURIComponent(activeParcel)}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      )

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message =
          payload?.message ??
          "Failed to cancel GLS label."
        throw new Error(message)
      }

      if (Array.isArray(payload?.errors) && payload.errors.length) {
        const errorText = payload.errors.join("; ")
        toast.warning("GLS cancellation returned errors", {
          description: errorText,
        })
      } else {
        toast.success("GLS label cancelled")
      }

      await loadStatus(activeParcel)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to cancel GLS label."
      toast.error("GLS cancel", {
        description: message,
      })
    } finally {
      setCanceling(false)
    }
  }, [activeParcel, loadStatus, prompt])

  const statusList = status?.status_list ?? []

  return (
    <div className="flex flex-col gap-y-4">
      <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-6 shadow-card-rest">
        <div className="flex flex-col gap-y-1">
          <Text size="large" weight="plus">
            GLS
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Search GLS parcel numbers and manage labels.
          </Text>
        </div>
        <form
          className="mt-4 flex flex-col gap-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSearch()
          }}
        >
          <Text size="xsmall" className="text-ui-fg-subtle">
            Parcel number
          </Text>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={parcelInput}
              onChange={(event) =>
                setParcelInput(event.target.value)
              }
              placeholder="3385368955"
            />
            <Button
              type="submit"
              variant="secondary"
              isLoading={loading}
            >
              Search
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-6 shadow-card-rest">
        <div className="flex items-center justify-between">
          <Text size="small" weight="plus">
            Status
          </Text>
          {statusLabel ? (
            <StatusBadge color={statusColor}>
              {statusLabel}
            </StatusBadge>
          ) : null}
        </div>

        {statusError ? (
          <Text
            size="small"
            className="mt-3 text-ui-fg-error"
          >
            {statusError}
          </Text>
        ) : status ? (
          <div className="mt-3 flex flex-col gap-y-2">
            <Text size="small">
              Parcel: {status.parcel_number}
            </Text>
            {status.status?.info ? (
              <Text size="small" className="text-ui-fg-subtle">
                {status.status.info}
              </Text>
            ) : null}
            {status.status?.date ? (
              <Text size="small" className="text-ui-fg-subtle">
                Updated: {status.status.date}
              </Text>
            ) : null}
            {status.errors?.length ? (
              <Text size="small" className="text-ui-fg-error">
                {status.errors.join("; ")}
              </Text>
            ) : null}
            {statusList.length ? (
              <div className="mt-2 flex flex-col gap-y-1">
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Status history
                </Text>
                {statusList.map((entry, index) => {
                  const label =
                    entry.description ?? entry.code ?? "Status"
                  return (
                    <Text
                      key={`${label}-${index}`}
                      size="xsmall"
                      className="text-ui-fg-subtle"
                    >
                      {label}
                      {entry.date ? ` · ${entry.date}` : ""}
                    </Text>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <Text size="small" className="mt-3 text-ui-fg-subtle">
            Enter a parcel number to view GLS status.
          </Text>
        )}

        <div className="mt-4">
          <Button
            variant="secondary"
            onClick={handleCancel}
            disabled={!activeParcel || canceling}
            isLoading={canceling}
          >
            Cancel GLS label
          </Button>
        </div>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "GLS",
  nested: "/price-lists",
})

export default GlsPage
