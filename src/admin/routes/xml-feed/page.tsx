import {
  type ComponentType,
  type SVGProps,
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

import {
  type FeedStatusChannel,
  type FeedStatusMarket,
  getDefaultFeedChannelStatusByMarket,
  normalizeFeedChannelStatusByMarket,
} from "../../../lib/feed-status"

const FEED_MARKETS: Record<
  FeedStatusMarket,
  {
    country_code: "hu" | "sk"
    currency_code: "huf" | "eur"
    flag: string
    label: string
  }
> = {
  hu_huf: {
    country_code: "hu",
    currency_code: "huf",
    flag: "🇭🇺",
    label: "HU / HUF",
  },
  sk_eur: {
    country_code: "sk",
    currency_code: "eur",
    flag: "🇸🇰",
    label: "SK / EUR",
  },
}

const FEED_CHANNELS: Array<{
  key: FeedStatusChannel
  label: string
  description: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}> = [
  {
    key: "facebook",
    label: "Facebook",
    description: "Meta/Facebook termékkatalógus feed állapot.",
    Icon: Facebook,
  },
  {
    key: "google",
    label: "Google",
    description: "Google Merchant termékfeed állapot.",
    Icon: Google,
  },
]

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

const XmlFeedPage = () => {
  const [selectedMarket, setSelectedMarket] = useState<FeedStatusMarket>("hu_huf")
  const [statusByMarket, setStatusByMarket] = useState(
    getDefaultFeedChannelStatusByMarket()
  )
  const [statusLoading, setStatusLoading] = useState(true)
  const [savingChannel, setSavingChannel] = useState<FeedStatusChannel | null>(null)

  const selectedMarketConfig = FEED_MARKETS[selectedMarket]
  const { country_code: countryCode, currency_code: currencyCode } = selectedMarketConfig

  const feedUrl = useMemo(() => {
    const params = new URLSearchParams({
      country_code: countryCode,
      currency_code: currencyCode,
    })

    const relativePath = `/product-feed?${params.toString()}`

    if (typeof window === "undefined") {
      return relativePath
    }

    return `${window.location.origin}${relativePath}`
  }, [countryCode, currencyCode])

  const loadStatus = useCallback(async () => {
    setStatusLoading(true)

    try {
      const response = await fetch("/admin/feed-status", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          "Nem sikerült lekérni a feed kapcsolat állapotát."
        )
        throw new Error(message)
      }

      const payload = (await response.json()) as {
        status?: unknown
      }

      setStatusByMarket(normalizeFeedChannelStatusByMarket(payload?.status))
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nem sikerült lekérni a feed kapcsolat állapotát."

      toast.error("Feed kapcsolatok", {
        description: message,
      })
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const handleCopy = useCallback(async () => {
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
    if (typeof window === "undefined") {
      return
    }

    window.open(feedUrl, "_blank", "noopener,noreferrer")
  }, [feedUrl])

  const handleMarketChange = useCallback((value: string) => {
    if (value in FEED_MARKETS) {
      setSelectedMarket(value as FeedStatusMarket)
    }
  }, [])

  const handleToggleChannel = useCallback(
    async (channel: FeedStatusChannel, active: boolean) => {
      setSavingChannel(channel)

      try {
        const response = await fetch("/admin/feed-status", {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            market: selectedMarket,
            channel,
            active,
          }),
        })

        if (!response.ok) {
          const message = await readErrorMessage(
            response,
            "Nem sikerült menteni a feed kapcsolat állapotát."
          )
          throw new Error(message)
        }

        const payload = (await response.json()) as {
          status?: unknown
        }

        setStatusByMarket(normalizeFeedChannelStatusByMarket(payload?.status))

        const channelLabel = FEED_CHANNELS.find((item) => item.key === channel)?.label ||
          channel

        toast.success("Feed státusz frissítve", {
          description: `${channelLabel}: ${active ? "aktív" : "inaktív"} (${FEED_MARKETS[selectedMarket].label}).`,
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Nem sikerült menteni a feed kapcsolat állapotát."

        toast.error("Feed kapcsolatok", {
          description: message,
        })
      } finally {
        setSavingChannel(null)
      }
    },
    [selectedMarket]
  )

  const selectedMarketStatus = statusByMarket[selectedMarket]

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
              <Select value={selectedMarket} onValueChange={handleMarketChange}>
                <Select.Trigger>
                  <Select.Value placeholder="Válassz piacot" />
                </Select.Trigger>
                <Select.Content>
                  {(Object.keys(FEED_MARKETS) as FeedStatusMarket[]).map((market) => {
                    const config = FEED_MARKETS[market]
                    return (
                      <Select.Item key={market} value={market}>
                        {config.flag} {config.label}
                      </Select.Item>
                    )
                  })}
                </Select.Content>
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-y-1">
              <Text size="xsmall" className="text-ui-fg-subtle">
                országkód: {selectedMarketConfig.flag} {countryCode.toUpperCase()}
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle">
                pénznemkód: {currencyCode.toUpperCase()}
              </Text>
            </div>
          </div>

          <div className="mt-4">
            <Text size="xsmall" weight="plus" className="mb-1">
              Feed URL
            </Text>
            <Input value={feedUrl} readOnly />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={handleOpen}>
                XML megnyitása
              </Button>
              <Button type="button" onClick={() => void handleCopy()}>
                Link másolása
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
          <div className="flex items-center justify-between">
            <Heading level="h2">Csatorna állapotok</Heading>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Piac: {selectedMarketConfig.flag} {selectedMarketConfig.label}
            </Text>
          </div>

          {statusLoading ? (
            <Text size="small" className="mt-3 text-ui-fg-subtle">
              Kapcsolati állapot betöltése...
            </Text>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {FEED_CHANNELS.map((channel) => {
                const active = selectedMarketStatus[channel.key]
                const isSaving = savingChannel === channel.key

                return (
                  <div
                    key={channel.key}
                    className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <channel.Icon className="text-ui-fg-subtle" />
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
                        disabled={statusLoading || Boolean(savingChannel)}
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
