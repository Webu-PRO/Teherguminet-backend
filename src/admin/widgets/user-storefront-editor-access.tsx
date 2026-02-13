import { useCallback, useEffect, useMemo, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"
import type { HttpTypes } from "@medusajs/types"

type AccessPayload = {
  ok: boolean
  user?: {
    id?: string
    email?: string
  }
  customer?: {
    id?: string
    email?: string
    created?: boolean
    updated?: boolean
  }
  auth?: {
    auth_identity_id?: string | null
    identity_created?: boolean
    customer_linked?: boolean
    temporary_password?: string | null
  }
  storefront_editor?: {
    employee_id?: string | null
    company_id?: string | null
    is_admin?: boolean
    enabled?: boolean
    employee_created?: boolean
    employee_updated?: boolean
    company_created?: boolean
    matched_employees?: number
  }
}

type WidgetProps = {
  data: HttpTypes.AdminUser
}

const readErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as {
      message?: string
      error?: string
    }

    const message = payload?.message ?? payload?.error
    if (typeof message === "string" && message.trim().length) {
      return message
    }
  } catch {
    // ignore parse issues
  }

  return fallback
}

const copyToClipboard = async (value: string) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
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

const UserStorefrontEditorAccessWidget = ({ data }: WidgetProps) => {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<AccessPayload | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null)

  const email = useMemo(() => data.email?.trim() || "", [data.email])
  const userId = data.id

  const fetchStatus = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `/admin/users/${encodeURIComponent(userId)}/storefront-editor-access`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      )

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          "Nem sikerült lekérni a storefront hozzáférési állapotot."
        )
        throw new Error(message)
      }

      const payload = (await response.json()) as AccessPayload
      setResult(payload)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nem sikerült lekérni a storefront hozzáférési állapotot."
      toast.error("Storefront hozzáférés", {
        description: message,
      })
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  const handleToggle = useCallback(
    async (nextEnabled: boolean) => {
      if (!userId) {
        toast.error("Storefront hozzáférés", {
          description: "Hiányzó admin felhasználó-azonosító.",
        })
        return
      }

      setSubmitting(true)
      try {
        const response = await fetch(
          `/admin/users/${encodeURIComponent(userId)}/storefront-editor-access`,
          {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              enabled: nextEnabled,
            }),
          }
        )

        if (!response.ok) {
          const message = await readErrorMessage(
            response,
            "Nem sikerült frissíteni a storefront hozzáférést."
          )
          throw new Error(message)
        }

        const payload = (await response.json()) as AccessPayload
        setResult(payload)
        const password = payload?.auth?.temporary_password ?? null
        setTemporaryPassword(password)

        toast.success("Storefront hozzáférés frissítve", {
          description: nextEnabled
            ? "A felhasználó storefront szerkesztő jogosultsága aktív."
            : "A felhasználó storefront szerkesztő jogosultsága letiltva.",
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Nem sikerült frissíteni a storefront hozzáférést."
        toast.error("Storefront hozzáférés", {
          description: message,
        })
      } finally {
        setSubmitting(false)
      }
    },
    [userId]
  )

  const enabled = Boolean(
    result?.storefront_editor?.enabled ?? result?.storefront_editor?.is_admin
  )

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div>
          <Heading level="h3">Storefront Tartalomszerkesztő Hozzáférés</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            A felhasználóhoz kapcsolt storefront customer account jogosultságát
            itt tudod be- vagy kikapcsolni.
          </Text>
          <Text size="xsmall" className="text-ui-fg-subtle mt-2">
            E-mail: {email || "-"}
          </Text>
        </div>

        <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
          <Text size="xsmall" weight="plus">
            Állapot: {loading ? "betöltés..." : enabled ? "aktív" : "inaktív"}
          </Text>
          <Text size="xsmall" className="text-ui-fg-subtle mt-1">
            Customer: {result?.customer?.id ?? "-"}
          </Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Employee: {result?.storefront_editor?.employee_id ?? "-"}
          </Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Auth identity: {result?.auth?.auth_identity_id ?? "-"}
          </Text>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="small"
            onClick={() => {
              void handleToggle(!enabled)
            }}
            isLoading={submitting}
            disabled={loading || !email || submitting}
          >
            {enabled ? "Hozzáférés letiltása" : "Hozzáférés engedélyezése"}
          </Button>

          <Button
            size="small"
            variant="secondary"
            onClick={() => {
              void fetchStatus()
            }}
            disabled={loading || submitting}
          >
            Frissítés
          </Button>
        </div>

        {temporaryPassword ? (
          <div className="rounded-md border border-ui-border-base bg-ui-bg-base p-3">
            <Text size="xsmall" weight="plus">
              Ideiglenes storefront jelszó
            </Text>
            <pre className="mt-2 overflow-auto rounded bg-ui-bg-subtle px-2 py-1 text-[11px]">
              {temporaryPassword}
            </pre>
            <Button
              size="small"
              variant="secondary"
              className="mt-2"
              onClick={() => {
                void copyToClipboard(temporaryPassword).then(() => {
                  toast.success("Jelszó másolva")
                })
              }}
            >
              Jelszó másolása
            </Button>
          </div>
        ) : null}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "user.details.after",
})

export default UserStorefrontEditorAccessWidget
