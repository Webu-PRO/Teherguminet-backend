import { useEffect, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Text } from "@medusajs/ui"
import { useLocation, useNavigate } from "react-router-dom"

import { sdk } from "../lib/client"

type TomketSummary = {
  catalog?: { imported_variants?: number; producers?: number }
}

type TagListResponse = {
  product_tags?: Array<{ id: string; value: string }>
}

const TOMKET_TAG_VALUE = "tomket-dropship"
const TOMKET_IMAGE_HOST = "img.tomket.com"
const BADGE_ATTR = "data-tomket-badge"
const ROW_ATTR = "data-tomket-row"

const TomketChip = () => (
  <span className="inline-flex items-center rounded-md bg-[#F26522] px-2 py-1">
    <span className="text-[11px] font-bold uppercase leading-none tracking-wider text-white">
      Tomket
    </span>
  </span>
)

/**
 * The product table is rendered by the dashboard itself and offers no
 * per-row extension point, so this marks the Tomket rows after the fact:
 * every imported tyre carries its image from the supplier's CDN, which is the
 * most reliable signal available in the DOM. A MutationObserver keeps the
 * chips in place across pagination, filtering and re-renders.
 */
const useTomketRowBadges = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      return
    }

    const decorate = () => {
      const images = document.querySelectorAll<HTMLImageElement>(
        `table img[src*="${TOMKET_IMAGE_HOST}"]`
      )

      for (const image of images) {
        const row = image.closest("tr")
        if (!row || row.hasAttribute(ROW_ATTR)) {
          continue
        }

        const cell = image.closest("td")
        if (!cell) {
          continue
        }

        const chip = document.createElement("span")
        chip.setAttribute(BADGE_ATTR, "true")
        chip.className =
          "ml-2 inline-flex shrink-0 items-center rounded-md bg-[#F26522] px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase leading-none tracking-wider text-white"
        chip.textContent = "Tomket"
        chip.title = "Tomket dropship – a beszállító raktárából, rendelésre"

        // Sit next to the title text: the cell wraps thumbnail + title in one
        // flex container, so appending to it keeps the chip on the same line.
        const target =
          (image.parentElement?.parentElement as HTMLElement | null) ?? cell
        target.appendChild(chip)
        row.setAttribute(ROW_ATTR, "true")
      }
    }

    let scheduled = false
    const schedule = () => {
      if (scheduled) {
        return
      }
      scheduled = true
      window.requestAnimationFrame(() => {
        scheduled = false
        decorate()
      })
    }

    decorate()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      document
        .querySelectorAll(`[${BADGE_ATTR}]`)
        .forEach((node) => node.remove())
      document
        .querySelectorAll(`[${ROW_ATTR}]`)
        .forEach((node) => node.removeAttribute(ROW_ATTR))
    }
  }, [enabled])
}

const ProductListTomketWidget = () => {
  const [summary, setSummary] = useState<TomketSummary | null>(null)
  const [tagId, setTagId] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [payload, tags] = await Promise.all([
          sdk.client.fetch("/admin/tomket", { method: "GET" }) as Promise<TomketSummary>,
          sdk.client.fetch("/admin/product-tags", {
            method: "GET",
            query: { value: TOMKET_TAG_VALUE, limit: 1, fields: "id,value" },
          }) as Promise<TagListResponse>,
        ])

        if (!cancelled) {
          setSummary(payload)
          setTagId(
            tags.product_tags?.find((tag) => tag.value === TOMKET_TAG_VALUE)
              ?.id ?? null
          )
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
  useTomketRowBadges(count > 0)

  // Stay out of the way until there is actually a Tomket catalogue.
  if (!count) {
    return null
  }

  const params = new URLSearchParams(location.search)
  const filtered = Boolean(tagId) && params.get("tag_id") === tagId

  const showTomketOnly = () => {
    if (!tagId) {
      return
    }
    const next = new URLSearchParams()
    next.set("tag_id", tagId)
    navigate(`${location.pathname}?${next.toString()}`)
  }

  const clearFilter = () => {
    navigate(location.pathname)
  }

  return (
    <Container className="flex flex-wrap items-center gap-3 px-6 py-4">
      <TomketChip />
      <Text size="small">
        <strong>{count}</strong> dropship gumiabroncs a katalógusban
        {summary?.catalog?.producers
          ? `, ${summary.catalog.producers} gyártótól`
          : ""}
        . A listában a Tomket-sorok narancs jelölést kapnak.
      </Text>
      {tagId ? (
        filtered ? (
          <Button size="small" variant="secondary" onClick={clearFilter}>
            Szűrő törlése
          </Button>
        ) : (
          <Button size="small" variant="secondary" onClick={showTomketOnly}>
            Csak a Tomket termékek
          </Button>
        )
      ) : (
        <Text size="small" className="text-ui-fg-subtle">
          Szűréshez a szűrőknél válaszd a „{TOMKET_TAG_VALUE}” címkét.
        </Text>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.list.before",
})

export default ProductListTomketWidget
