import { useCallback, useMemo, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DocumentText } from "@medusajs/icons"
import { Button, Container, Heading, Input, Select, Text, toast } from "@medusajs/ui"

const FEED_MARKETS = {
  hu_huf: {
    country_code: "hu",
    currency_code: "huf",
    label: "HU / HUF",
  },
  sk_eur: {
    country_code: "sk",
    currency_code: "eur",
    label: "SK / EUR",
  },
} as const

type FeedMarketKey = keyof typeof FEED_MARKETS
type FeedMarket = (typeof FEED_MARKETS)[FeedMarketKey]

const FEED_MARKET_LIST = Object.values(FEED_MARKETS) as FeedMarket[]

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

const XmlFeedPage = () => {
  const [selectedMarket, setSelectedMarket] = useState<FeedMarketKey>("hu_huf")

  const countryCode = FEED_MARKETS[selectedMarket].country_code
  const currencyCode = FEED_MARKETS[selectedMarket].currency_code

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

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(feedUrl)
      toast.success("XML feed", {
        description: "Feed link copied to clipboard.",
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

  const handleCountryChange = useCallback((value: string) => {
    const matchingMarket = (Object.keys(FEED_MARKETS) as FeedMarketKey[]).find(
      (key) => FEED_MARKETS[key].country_code === value
    )

    if (!matchingMarket) {
      return
    }

    setSelectedMarket(matchingMarket)
  }, [])

  const handleCurrencyChange = useCallback((value: string) => {
    const matchingMarket = (Object.keys(FEED_MARKETS) as FeedMarketKey[]).find(
      (key) => FEED_MARKETS[key].currency_code === value
    )

    if (!matchingMarket) {
      return
    }

    setSelectedMarket(matchingMarket)
  }, [])

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-4 px-6 py-4">
        <div>
          <Heading level="h1">XML FEED</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Generate and access the product XML feed URL for Meta and Google.
          </Text>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Text size="xsmall" weight="plus" className="mb-1">
              country_code
            </Text>
            <Select value={countryCode} onValueChange={handleCountryChange}>
              <Select.Trigger>
                <Select.Value placeholder="Select country code" />
              </Select.Trigger>
              <Select.Content>
                {FEED_MARKET_LIST.map((market) => (
                  <Select.Item key={market.country_code} value={market.country_code}>
                    {market.country_code} ({market.label})
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div>
            <Text size="xsmall" weight="plus" className="mb-1">
              currency_code
            </Text>
            <Select value={currencyCode} onValueChange={handleCurrencyChange}>
              <Select.Trigger>
                <Select.Value placeholder="Select currency code" />
              </Select.Trigger>
              <Select.Content>
                {FEED_MARKET_LIST.map((market) => (
                  <Select.Item key={market.currency_code} value={market.currency_code}>
                    {market.currency_code} ({market.label})
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </div>

        <div>
          <Text size="xsmall" weight="plus" className="mb-1">
            Feed URL
          </Text>
          <Input value={feedUrl} readOnly />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={handleOpen}>
            Open XML
          </Button>
          <Button type="button" onClick={() => void handleCopy()}>
            Copy link
          </Button>
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
