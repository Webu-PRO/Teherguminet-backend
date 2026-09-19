import { useEffect, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Container, Text } from "@medusajs/ui"

import { sdk } from "../lib/client"

type TomketSummary = {
  catalog?: { imported_variants?: number; producers?: number }
}

/**
 * Widgets cannot inject a badge into individual product list rows, so this
 * banner tells the operator how many Tomket tyres are in the catalogue and how
 * to isolate them (they all carry the "tomket-dropship" tag).
 */
const ProductListTomketWidget = () => {
  const [summary, setSummary] = useState<TomketSummary | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const payload = (await sdk.client.fetch("/admin/tomket", {
          method: "GET",
        })) as TomketSummary

        if (!cancelled) {
          setSummary(payload)
        }
      } catch {
        if (!cancelled) {
          setSummary(null)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const count = summary?.catalog?.imported_variants ?? 0

  // Stay out of the way until there is actually a Tomket catalogue.
  if (!count) {
    return null
  }

  return (
    <Container className="flex flex-wrap items-center gap-3 px-6 py-4">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#F26522] px-2 py-1">
        <span className="text-[11px] font-bold uppercase leading-none tracking-wider text-white">
          Tomket
        </span>
      </span>
      <Text size="small">
        <strong>{count}</strong> dropship gumiabroncs a katalógusban
        {summary?.catalog?.producers
          ? `, ${summary.catalog.producers} gyártótól`
          : ""}
        .
      </Text>
      <Text size="small" className="text-ui-fg-subtle">
        Szűréshez válaszd a
      </Text>
      <Badge size="2xsmall">tomket-dropship</Badge>
      <Text size="small" className="text-ui-fg-subtle">
        címkét.
      </Text>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.list.before",
})

export default ProductListTomketWidget
