import { useCallback, useMemo, useState, type ChangeEvent } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"

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
  const [countryCode, setCountryCode] = useState("hu")
  const [currencyCode, setCurrencyCode] = useState("huf")

  const normalizedCountryCode = countryCode.trim().toLowerCase()
  const normalizedCurrencyCode = currencyCode.trim().toLowerCase()

  const relativePath = useMemo(() => {
    const params = new URLSearchParams({
      country_code: normalizedCountryCode,
      currency_code: normalizedCurrencyCode,
    })

    return `/product-feed?${params.toString()}`
  }, [normalizedCountryCode, normalizedCurrencyCode])

  const feedUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return relativePath
    }

    return `${window.location.origin}${relativePath}`
  }, [relativePath])

  const isInvalid = !normalizedCountryCode || !normalizedCurrencyCode

  const handleCopy = useCallback(async () => {
    if (isInvalid) {
      toast.error("XML feed", {
        description: "A country_code és currency_code mező kitöltése kötelező.",
      })
      return
    }

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
  }, [feedUrl, isInvalid])

  const handleOpen = useCallback(() => {
    if (isInvalid) {
      toast.error("XML feed", {
        description: "A country_code és currency_code mező kitöltése kötelező.",
      })
      return
    }

    if (typeof window === "undefined") {
      return
    }

    window.open(feedUrl, "_blank", "noopener,noreferrer")
  }, [feedUrl, isInvalid])

  const handleCountryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCountryCode(event.target.value)
  }, [])

  const handleCurrencyChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCurrencyCode(event.target.value)
  }, [])

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-4 px-6 py-4">
        <div>
          <Heading level="h1">XML FEED</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Generate and access the product XML feed URL.
          </Text>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Text size="xsmall" weight="plus" className="mb-1">
              country_code
            </Text>
            <Input
              value={countryCode}
              onChange={handleCountryChange}
              placeholder="hu"
            />
          </div>
          <div>
            <Text size="xsmall" weight="plus" className="mb-1">
              currency_code
            </Text>
            <Input
              value={currencyCode}
              onChange={handleCurrencyChange}
              placeholder="huf"
            />
          </div>
        </div>

        <div>
          <Text size="xsmall" weight="plus" className="mb-1">
            Feed URL
          </Text>
          <Input value={feedUrl} readOnly />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={handleOpen} disabled={isInvalid}>
            Open XML
          </Button>
          <Button type="button" onClick={() => void handleCopy()} disabled={isInvalid}>
            Copy link
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "XML FEED",
})

export default XmlFeedPage
