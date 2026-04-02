import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DocumentText, Facebook, Google } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Input,
  Select,
  StatusBadge,
  Switch,
  Text,
  toast,
} from "@medusajs/ui"

import { sdk } from "../../lib/client"
import {
  type FeedChannelStatusByMarket,
  type FeedStatusChannel,
  buildFeedStatusContext,
  normalizeFeedChannelStatusByMarket,
} from "../../../lib/feed-status"
import { normalizeFeedMarkets, type FeedMarket } from "../../../lib/feed-markets"

const FEED_CHANNELS: Array<{
  key: FeedStatusChannel
  label: string
  description: string
  Icon: ComponentType<{ className?: string }>
  iconClassName?: string
}> = [
  {
    key: "facebook",
    label: "Facebook",
    description: "Meta/Facebook termékkatalógus feed állapot.",
    Icon: Facebook,
    iconClassName: "text-[#1877F2]",
  },
  {
    key: "google",
    label: "Google",
    description: "Google Merchant termékfeed állapot.",
    Icon: Google,
  },
]

type FeedStatusResponse = {
  status?: unknown
  markets?: unknown
}

const EMPTY_CHANNEL_STATUS: Record<FeedStatusChannel, boolean> = {
  facebook: false,
  google: false,
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

const readErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim().length) {
    return error.message
  }

  if (
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message.trim()
    if (message.length) {
      return message
    }
  }

  return fallback
}

const normalizeFeedStatusPayload = (payload: FeedStatusResponse) => {
  const markets = normalizeFeedMarkets(payload.markets)
  const statusContext = buildFeedStatusContext(markets)

  return {
    markets,
    statusByMarket: normalizeFeedChannelStatusByMarket(payload.status, statusContext),
  }
}

const XmlFeedPage = () => {
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null)
  const [markets, setMarkets] = useState<FeedMarket[]>([])
  const [statusByMarket, setStatusByMarket] = useState<FeedChannelStatusByMarket>({})
  const [statusLoading, setStatusLoading] = useState(true)
  const [savingChannel, setSavingChannel] = useState<FeedStatusChannel | null>(null)

  const selectedMarket = useMemo(() => {
    if (!selectedMarketId) {
      return markets[0] ?? null
    }

    return markets.find((entry) => entry.id === selectedMarketId) ?? markets[0] ?? null
  }, [markets, selectedMarketId])

  const selectedRegionStatus = useMemo(() => {
    if (!selectedMarket) {
      return EMPTY_CHANNEL_STATUS
    }

    return statusByMarket[selectedMarket.region_id] ?? EMPTY_CHANNEL_STATUS
  }, [selectedMarket, statusByMarket])

  const feedUrl = useMemo(() => {
    if (!selectedMarket) {
      return ""
    }

    const params = new URLSearchParams({
      country_code: selectedMarket.country_code,
      currency_code: selectedMarket.currency_code,
    })

    const relativePath = `/product-feed?${params.toString()}`

    if (typeof window === "undefined") {
      return relativePath
    }

    return `${window.location.origin}${relativePath}`
  }, [selectedMarket])

  const applyPayload = useCallback((payload: FeedStatusResponse) => {
    const normalized = normalizeFeedStatusPayload(payload)

    setMarkets(normalized.markets)
    setStatusByMarket(normalized.statusByMarket)
    setSelectedMarketId((current) => {
      if (current && normalized.markets.some((entry) => entry.id === current)) {
        return current
      }

      return normalized.markets[0]?.id ?? null
    })
  }, [])

  const loadStatus = useCallback(async () => {
    setStatusLoading(true)

    try {
      const payload = (await sdk.client.fetch("/admin/feed-status", {
        method: "GET",
      })) as FeedStatusResponse

      applyPayload(payload)
    } catch (error) {
      const message = readErrorMessage(
        error,
        "Nem sikerült lekérni a feed kapcsolat állapotát."
      )

      toast.error("Feed kapcsolatok", {
        description: message,
      })
    } finally {
      setStatusLoading(false)
    }
  }, [applyPayload])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const handleCopy = useCallback(async () => {
    if (!feedUrl) {
      return
    }

    try {
      await copyToClipboard(feedUrl)
      toast.success("XML feed", {
        description: "Feed link kimásolva a vágólapra.",
      })
    } catch {
      toast.error("XML feed", {
        description: "Nem sikerült a feed link másolása.",
      })
    }
  }, [feedUrl])

  const handleOpen = useCallback(() => {
    if (typeof window === "undefined" || !feedUrl) {
      return
    }

    window.open(feedUrl, "_blank", "noopener,noreferrer")
  }, [feedUrl])

  const handleMarketChange = useCallback((value: string) => {
    if (markets.some((market) => market.id === value)) {
      setSelectedMarketId(value)
    }
  }, [markets])

  const handleToggleChannel = useCallback(
    async (channel: FeedStatusChannel, active: boolean) => {
      if (!selectedMarket) {
        return
      }

      setSavingChannel(channel)

      try {
        const payload = (await sdk.client.fetch("/admin/feed-status", {
          method: "PATCH",
          body: {
            market: selectedMarket.region_id,
            channel,
            active,
          },
        })) as FeedStatusResponse

        applyPayload(payload)

        const channelLabel = FEED_CHANNELS.find((item) => item.key === channel)?.label ||
          channel

        toast.success("Feed státusz frissítve", {
          description: `${channelLabel}: ${active ? "aktív" : "inaktív"} (${selectedMarket.label}).`,
        })
      } catch (error) {
        const message = readErrorMessage(
          error,
          "Nem sikerült menteni a feed kapcsolat állapotát."
        )

        toast.error("Feed kapcsolatok", {
          description: message,
        })
      } finally {
        setSavingChannel(null)
      }
    },
    [applyPayload, selectedMarket]
  )

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-4 px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <DocumentText className="text-ui-fg-subtle" />
            <Heading level="h1">XML Feed kapcsolatok</Heading>
          </div>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Feed URL kezelése, valamint Facebook és Google csatornaállapot piaconként.
          </Text>
        </div>

        <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Text size="xsmall" weight="plus" className="mb-1">
                Piac
              </Text>
              <Select
                value={selectedMarket?.id ?? ""}
                onValueChange={handleMarketChange}
                disabled={markets.length === 0}
              >
                <Select.Trigger>
                  <Select.Value placeholder="Válassz piacot" />
                </Select.Trigger>
                <Select.Content>
                  {markets.map((market) => (
                    <Select.Item key={market.id} value={market.id}>
                      {market.flag} {market.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-y-1">
              <Text size="xsmall" className="text-ui-fg-subtle">
                régió: {selectedMarket?.region_name ?? "-"}
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle">
                országkód: {selectedMarket?.flag ?? "🌍"} {selectedMarket?.country_code.toUpperCase() ?? "-"}
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle">
                pénznemkód: {selectedMarket?.currency_code.toUpperCase() ?? "-"}
              </Text>
            </div>
          </div>

          <div className="mt-4">
            <Text size="xsmall" weight="plus" className="mb-1">
              Feed URL
            </Text>
            <Input value={feedUrl} readOnly />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleOpen}
                disabled={!selectedMarket}
              >
                XML megnyitása
              </Button>
              <Button
                type="button"
                onClick={() => void handleCopy()}
                disabled={!selectedMarket}
              >
                Link másolása
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
          <div className="flex items-center justify-between">
            <Heading level="h2">Csatorna állapotok</Heading>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Piac: {selectedMarket ? `${selectedMarket.flag} ${selectedMarket.label}` : "-"}
            </Text>
          </div>

          {statusLoading ? (
            <Text size="small" className="mt-3 text-ui-fg-subtle">
              Kapcsolati állapot betöltése...
            </Text>
          ) : markets.length === 0 ? (
            <Text size="small" className="mt-3 text-ui-fg-subtle">
              Nincs elérhető régió, amelyhez feed piac generálható.
            </Text>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {FEED_CHANNELS.map((channel) => {
                const active = selectedRegionStatus[channel.key]
                const isSaving = savingChannel === channel.key

                return (
                  <div
                    key={channel.key}
                    className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <channel.Icon
                          className={channel.iconClassName ?? "text-ui-fg-subtle"}
                        />
                        <div>
                          <Text size="small" weight="plus">
                            {channel.label}
                          </Text>
                          <Text size="xsmall" className="text-ui-fg-subtle mt-1">
                            {channel.description}
                          </Text>
                        </div>
                      </div>
                      <StatusBadge color={active ? "green" : "grey"}>
                        {active ? "Aktív" : "Inaktív"}
                      </StatusBadge>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        Feed használat
                      </Text>
                      <Switch
                        checked={active}
                        onCheckedChange={(nextValue) => {
                          void handleToggleChannel(channel.key, Boolean(nextValue))
                        }}
                        disabled={
                          statusLoading ||
                          Boolean(savingChannel) ||
                          !selectedMarket
                        }
                      />
                    </div>

                    {isSaving ? (
                      <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
                        Mentés folyamatban...
                      </Text>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "XML FEED",
  icon: DocumentText,
})

export default XmlFeedPage
