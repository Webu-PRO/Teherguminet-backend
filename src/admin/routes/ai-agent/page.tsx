import { useCallback, useEffect, useState } from "react"
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

const AiAgentPage = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [model, setModel] = useState("gpt-5.3-codex")
  const [statusMessage, setStatusMessage] = useState("")
  const [remediationCommand, setRemediationCommand] = useState("")

  const loadStatus = useCallback(async () => {
    setIsLoading(true)

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
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

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

          <div className="mt-4">
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
          </div>

          {!isConnected && !isLoading && remediationCommand ? (
            <div className="mt-3 rounded-md border border-ui-border-base bg-ui-bg-base p-3">
              <Text size="xsmall" className="text-ui-fg-subtle">
                Futtasd szerveren/terminálban a bejelentkezéshez:
              </Text>
              <code className="mt-1 block break-all text-xs">{remediationCommand}</code>
            </div>
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
