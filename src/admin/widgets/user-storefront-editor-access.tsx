import { useCallback, useMemo, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"
import type { HttpTypes } from "@medusajs/types"

type ProvisioningResponse = {
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
    auth_identity_id?: string
    identity_created?: boolean
    customer_linked?: boolean
    temporary_password?: string | null
  }
  storefront_editor?: {
    employee_id?: string | null
    company_id?: string | null
    is_admin?: boolean
    employee_created?: boolean
    company_created?: boolean
  }
  message?: string
}

type WidgetProps = {
  data: HttpTypes.AdminUser
}

const readErrorMessage = async (
  response: Response,
  fallback: string
) => {
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

const UserStorefrontEditorAccessWidget = ({ data }: WidgetProps) => {
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ProvisioningResponse | null>(
    null
  )

  const email = useMemo(
    () => data.email?.trim() || "",
    [data.email]
  )
  const userId = data.id

  const handleProvision = useCallback(async () => {
    if (!userId) {
      toast.error("Storefront hozzáférés", {
        description: "Hiányzó admin felhasználó-azonosító.",
      })
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(
        `/admin/users/${encodeURIComponent(
          userId
        )}/storefront-editor-access`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      )

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          "Nem sikerült beállítani a storefront tartalomszerkesztő hozzáférést."
        )
        throw new Error(message)
      }

      const payload = (await response.json()) as ProvisioningResponse
      setResult(payload)

      const temporaryPassword = payload?.auth?.temporary_password
      toast.success("Storefront hozzáférés frissítve", {
        description: temporaryPassword
          ? "Ideiglenes storefront jelszó létrejött. Másold és oszd meg biztonságosan."
          : "A vásárlói fiók és a tartalomszerkesztő admin jogosultság készen áll.",
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nem sikerült beállítani a storefront tartalomszerkesztő hozzáférést."
      toast.error("Storefront hozzáférés", {
        description: message,
      })
    } finally {
      setSubmitting(false)
    }
  }, [userId])

  const temporaryPassword = result?.auth?.temporary_password

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div>
          <Heading level="h3">
            Storefront Tartalomszerkesztő Hozzáférés
          </Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Regisztrál egy storefront vásárlói fiókot ehhez az
            e-mail-címhez, és admin jogosultságot ad a tartalomszerkesztőhöz.
          </Text>
          <Text size="xsmall" className="text-ui-fg-subtle mt-2">
            E-mail: {email || "-"}
          </Text>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="small"
            variant="secondary"
            onClick={handleProvision}
            isLoading={submitting}
            disabled={!email || submitting}
          >
            Regisztráció + Admin Jogosultság
          </Button>
        </div>

        {result?.ok ? (
          <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Vásárló:{" "}
              {result.customer?.created ? "létrehozva" : "meglévő"} ·{" "}
              {result.customer?.id ?? "-"}
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Szerkesztő hozzáférés:{" "}
              {result.storefront_editor?.employee_created
                ? "új admin jogosultság létrehozva"
                : "már megadva"}{" "}
              · alkalmazott {result.storefront_editor?.employee_id ?? "-"}
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Auth azonosító: {result.auth?.auth_identity_id ?? "-"}
            </Text>
          </div>
        ) : null}

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
