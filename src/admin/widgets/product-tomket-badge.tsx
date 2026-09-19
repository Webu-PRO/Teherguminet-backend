import { useEffect, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text } from "@medusajs/ui"

import { sdk } from "../lib/client"

type ProductData = {
  id: string
  metadata?: Record<string, unknown> | null
  variants?: Array<{ sku?: string | null }> | null
}

type WidgetProps = {
  data: ProductData
}

type VariantMetadata = Record<string, unknown>

type ProductResponse = {
  product?: {
    variants?: Array<{ sku?: string | null; metadata?: VariantMetadata | null }>
  }
}

const readString = (source: Record<string, unknown> | null | undefined, key: string) => {
  const value = source?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

const readNumber = (source: VariantMetadata | null | undefined, key: string) => {
  const value = source?.[key]
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

const formatLabelClass = (value: string | null) =>
  value ? value.toUpperCase() : null

/** The orange chip that marks a tyre as supplied by Tomket. */
const TomketMark = () => (
  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#F26522] px-2 py-1">
    <span className="text-[11px] font-bold uppercase leading-none tracking-wider text-white">
      Tomket
    </span>
    <span className="text-[10px] uppercase leading-none tracking-wide text-white/80">
      dropship
    </span>
  </span>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 py-1">
    <Text size="small" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="small" weight="plus" className="text-right">
      {value}
    </Text>
  </div>
)

const ProductTomketBadgeWidget = ({ data }: WidgetProps) => {
  const metadata = data?.metadata ?? null

  // Two independent signals: product metadata is what the importer writes, and
  // the sku prefix is the fallback for when the admin hands us a product
  // payload without metadata. Either one is enough to claim the tyre.
  const isTomket =
    readString(metadata, "tomket_source") === "dropship" ||
    (data?.variants ?? []).some(
      (variant) =>
        typeof variant.sku === "string" && variant.sku.startsWith("TOMKET-")
    )

  const [variantMeta, setVariantMeta] = useState<VariantMetadata | null>(null)

  useEffect(() => {
    if (!isTomket || !data?.id) {
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        const payload = (await sdk.client.fetch(
          `/admin/products/${data.id}?fields=id,*variants`,
          { method: "GET" }
        )) as ProductResponse

        const variant = (payload.product?.variants ?? []).find((candidate) =>
          typeof candidate.sku === "string" && candidate.sku.startsWith("TOMKET-")
        )

        if (!cancelled) {
          setVariantMeta(variant?.metadata ?? null)
        }
      } catch {
        // The mark itself is the point; supplier detail is a bonus.
        if (!cancelled) {
          setVariantMeta(null)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [data?.id, isTomket])

  // Nothing to say about tyres we did not import from Tomket.
  if (!isTomket) {
    return null
  }

  const internalId =
    readString(metadata, "tomket_internal_id") ??
    readString(variantMeta, "tomket_internal_id")
  const producer =
    readString(metadata, "tomket_producer") ??
    readString(variantMeta, "tomket_producer")
  const typeLabel = readString(metadata, "tomket_type_label")
  const gpsr = readString(metadata, "tomket_gpsr")

  const cost = readNumber(variantMeta, "tomket_cost_eur_net")
  const shipping = readNumber(variantMeta, "tomket_shipping_eur_net")
  const eprel = readString(variantMeta, "tomket_eprel")
  const syncedAt = readString(variantMeta, "tomket_synced_at")

  const rollingResistance = formatLabelClass(
    readString(variantMeta, "tomket_label_rolling_resistance")
  )
  const wetGrip = formatLabelClass(
    readString(variantMeta, "tomket_label_wet_grip")
  )
  const noise = readString(variantMeta, "tomket_label_noise_value")

  const euLabel = [
    rollingResistance && `Gördülés ${rollingResistance}`,
    wetGrip && `Nedves ${wetGrip}`,
    noise && `${noise} dB`,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <Heading level="h2">Beszállító</Heading>
        <TomketMark />
      </div>

      <div className="px-6 py-4">
        <Text size="small" className="text-ui-fg-subtle">
          Ezt a terméket a Tomket dropship feed hozta létre. Az ár és a készlet
          automatikusan frissül — kézi módosítás a következő szinkronnál elvész.
        </Text>
      </div>

      <div className="flex flex-col px-6 py-4">
        {internalId && <Row label="Tomket azonosító" value={internalId} />}
        {producer && <Row label="Gyártó" value={producer} />}
        {typeLabel && <Row label="Kategória" value={typeLabel} />}
        {cost !== null && (
          <Row label="Beszerzési ár (nettó)" value={`${cost} €`} />
        )}
        {shipping !== null && (
          <Row label="Szállítás / db (nettó)" value={`${shipping} €`} />
        )}
        {euLabel && <Row label="EU címke" value={euLabel} />}
        {eprel && <Row label="EPREL" value={eprel} />}
        {syncedAt && (
          <Row
            label="Utolsó szinkron"
            value={new Date(syncedAt).toLocaleString("hu-HU")}
          />
        )}
      </div>

      {gpsr && (
        <div className="px-6 py-4">
          <a
            href={gpsr}
            target="_blank"
            rel="noreferrer"
            className="text-ui-fg-interactive text-xs hover:underline"
          >
            GPSR termékbiztonsági adatlap ↗
          </a>
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.before",
})

export default ProductTomketBadgeWidget
