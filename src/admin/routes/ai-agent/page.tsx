import { useCallback, useEffect, useRef, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { AiAssistent } from "@medusajs/icons"
import { Button, Container, Heading, StatusBadge, Text, toast } from "@medusajs/ui"

type AiAgentStatusPayload = {
  status?: {
    provider?: string
    model?: string
    connected?: boolean
    message?: string
    sidecar_url?: string
    remediation_command?: string
  }
}

type AuthState = "idle" | "pending" | "connected" | "failed" | "expired"

type AiAgentAuthPayload = {
  status?: {
    state?: AuthState
    connected?: boolean
    verification_url?: string
    user_code?: string
    started_at?: string
    completed_at?: string
    expires_at?: string
    message?: string
  }
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

const AiAgentPage = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [model, setModel] = useState("gpt-5.3-codex")
  const [statusMessage, setStatusMessage] = useState("")
  const [remediationCommand, setRemediationCommand] = useState("")

  const [authState, setAuthState] = useState<AuthState>("idle")
  const [authConnected, setAuthConnected] = useState(false)
  const [authVerificationUrl, setAuthVerificationUrl] = useState("")
  const [authUserCode, setAuthUserCode] = useState("")
  const [authExpiresAt, setAuthExpiresAt] = useState("")
  const [authMessage, setAuthMessage] = useState("")
  const [isStartingAuth, setIsStartingAuth] = useState(false)
  const [isAuthRefreshing, setIsAuthRefreshing] = useState(false)

  const previousAuthStateRef = useRef<AuthState>("idle")

  const loadStatus = useCallback(async (quiet = false) => {
    if (!quiet) {
      setIsLoading(true)
    }

    try {
      const response = await fetch("/admin/ai-agent/status", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          "Nem sikerült lekérni az AI AGENT státuszát."
        )
        throw new Error(message)
      }

      const payload = (await response.json()) as AiAgentStatusPayload
      setIsConnected(payload?.status?.connected === true)
      setModel(payload?.status?.model?.trim() || "gpt-5.3-codex")
      setStatusMessage(payload?.status?.message?.trim() || "")
      setRemediationCommand(payload?.status?.remediation_command?.trim() || "")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nem sikerült lekérni az AI AGENT státuszát."

      toast.error("AI AGENT", {
        description: message,
      })
    } finally {
      if (!quiet) {
        setIsLoading(false)
      }
    }
  }, [])

  const loadAuthStatus = useCallback(async (quiet = false) => {
    if (!quiet) {
      setIsAuthRefreshing(true)
    }

    try {
      const response = await fetch("/admin/ai-agent/auth/status", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          "Nem sikerült lekérni a Codex bejelentkezés állapotát."
        )
        throw new Error(message)
      }

      const payload = (await response.json()) as AiAgentAuthPayload
      const status = payload?.status

      setAuthState(status?.state || "idle")
      setAuthConnected(status?.connected === true)
      setAuthVerificationUrl(status?.verification_url?.trim() || "")
      setAuthUserCode(status?.user_code?.trim() || "")
      setAuthExpiresAt(status?.expires_at?.trim() || "")
      setAuthMessage(status?.message?.trim() || "")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nem sikerült lekérni a Codex bejelentkezés állapotát."

      toast.error("AI AGENT", {
        description: message,
      })
    } finally {
      if (!quiet) {
        setIsAuthRefreshing(false)
      }
    }
  }, [])

  const startAuth = useCallback(async () => {
    setIsStartingAuth(true)

    try {
      const response = await fetch("/admin/ai-agent/auth/start", {
        method: "POST",
        credentials: "include",
      })

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          "Nem sikerült elindítani a Codex bejelentkezést."
        )
        throw new Error(message)
      }

      const payload = (await response.json()) as AiAgentAuthPayload
      const status = payload?.status

      setAuthState(status?.state || "idle")
      setAuthConnected(status?.connected === true)
      setAuthVerificationUrl(status?.verification_url?.trim() || "")
      setAuthUserCode(status?.user_code?.trim() || "")
      setAuthExpiresAt(status?.expires_at?.trim() || "")
      setAuthMessage(status?.message?.trim() || "")

      if (status?.connected) {
        toast.success("AI AGENT", {
          description: "Codex bejelentkezés már aktív.",
        })
        void loadStatus(true)
      } else {
        toast.success("AI AGENT", {
          description: "Bejelentkezési folyamat elindítva.",
        })
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nem sikerült elindítani a Codex bejelentkezést."

      toast.error("AI AGENT", {
        description: message,
      })
    } finally {
      setIsStartingAuth(false)
    }
  }, [loadStatus])

  useEffect(() => {
    void loadStatus()
    void loadAuthStatus(true)
  }, [loadAuthStatus, loadStatus])

  const isAuthPending = authState === "pending" && !authConnected

  useEffect(() => {
    if (!isAuthPending) {
      return
    }

    const timer = setInterval(() => {
      void loadAuthStatus(true)
    }, 3_000)

    return () => {
      clearInterval(timer)
    }
  }, [isAuthPending, loadAuthStatus])

  useEffect(() => {
    const previousState = previousAuthStateRef.current

    if (previousState === "pending" && authState === "connected") {
      toast.success("AI AGENT", {
        description: "Codex bejelentkezés sikeres.",
      })
      void loadStatus(true)
    }

    previousAuthStateRef.current = authState
  }, [authState, loadStatus])

  const formattedExpiry = authExpiresAt
    ? new Date(authExpiresAt).toLocaleString("hu-HU")
    : ""

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-4 px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <AiAssistent className="text-ui-fg-subtle" />
            <Heading level="h1">AI AGENT</Heading>
          </div>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            HU → SK automatikus fordítás a termék adatlap widgetből.
          </Text>
        </div>

        <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Text size="small" weight="plus">
                Codex CLI kapcsolat
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle mt-1">
                Modell: {model}
              </Text>
            </div>
            <StatusBadge color={isConnected ? "green" : "red"}>
              {isLoading
                ? "Ellenőrzés..."
                : isConnected
                  ? "Aktív"
                  : "Nincs Codex bejelentkezés"}
            </StatusBadge>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void loadStatus()
              }}
              disabled={isLoading}
            >
              Státusz frissítése
            </Button>

            {!isConnected ? (
              <Button
                type="button"
                onClick={() => {
                  void startAuth()
                }}
                disabled={isStartingAuth || isAuthPending || isAuthRefreshing}
              >
                {isStartingAuth || isAuthPending
                  ? "Bejelentkezés folyamatban..."
                  : "Codex bejelentkezés indítása"}
              </Button>
            ) : null}
          </div>

          {isAuthPending ? (
            <div className="mt-3 rounded-md border border-ui-border-base bg-ui-bg-base p-3">
              <Text size="xsmall" className="text-ui-fg-subtle">
                Nyisd meg a bejelentkezési oldalt, majd add meg az egyszer használatos kódot.
              </Text>

              {authVerificationUrl ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="block break-all text-xs">{authVerificationUrl}</code>
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.open(authVerificationUrl, "_blank", "noopener,noreferrer")
                      }
                    }}
                  >
                    Megnyitás
                  </Button>
                </div>
              ) : null}

              {authUserCode ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="text-xs">{authUserCode}</code>
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    onClick={() => {
                      void copyToClipboard(authUserCode)
                      toast.success("AI AGENT", {
                        description: "Kód kimásolva a vágólapra.",
                      })
                    }}
                  >
                    Kód másolása
                  </Button>
                </div>
              ) : (
                <Text size="xsmall" className="text-ui-fg-subtle mt-2">
                  Bejelentkezési kód betöltése...
                </Text>
              )}

              {formattedExpiry ? (
                <Text size="xsmall" className="text-ui-fg-subtle mt-2">
                  Kód lejárata: {formattedExpiry}
                </Text>
              ) : null}
            </div>
          ) : null}

          {!isConnected && !isLoading && !isAuthPending && remediationCommand ? (
            <div className="mt-3 rounded-md border border-ui-border-base bg-ui-bg-base p-3">
              <Text size="xsmall" className="text-ui-fg-subtle">
                Fallback: futtasd szerveren/terminálban a bejelentkezéshez:
              </Text>
              <code className="mt-1 block break-all text-xs">{remediationCommand}</code>
            </div>
          ) : null}

          {authMessage && !isConnected ? (
            <Text size="xsmall" className="text-ui-fg-subtle mt-3">
              {authMessage}
            </Text>
          ) : null}

          {statusMessage ? (
            <Text size="xsmall" className="text-ui-fg-subtle mt-3">
              {statusMessage}
            </Text>
          ) : null}

          <Text size="xsmall" className="text-ui-fg-subtle mt-3">
            Az AI fordítást a Termék oldalon, a „Lokalizált termék adatok (HU/SK)”
            widgetben találod.
          </Text>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "AI AGENT",
  icon: AiAssistent,
})

export default AiAgentPage
