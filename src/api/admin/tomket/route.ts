import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { resolveTomketConfig } from "../../../lib/tomket"
import { resolveTomketCountry, TOMKET_TIRE_TYPES } from "../../../lib/tomket-feed"
import {
  resolveTomketPricingConfig,
  TOMKET_SKU_PREFIX,
} from "../../../lib/tomket-catalog"
import { readTomketStatus } from "../../../lib/tomket-status"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { config, missing } = resolveTomketConfig()
  const { config: pricing, missing: missingPricing } =
    resolveTomketPricingConfig()

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "metadata"],
    filters: { sku: { $like: `${TOMKET_SKU_PREFIX}%` } },
  })

  const producers = new Set<string>()
  for (const variant of variants ?? []) {
    const producer = (variant.metadata as Record<string, unknown> | null)?.[
      "tomket_producer"
    ]
    if (typeof producer === "string" && producer) {
      producers.add(producer)
    }
  }

  res.status(200).json({
    configured: Boolean(config) && Boolean(pricing),
    missing: [...missing, ...missingPricing],
    country: resolveTomketCountry(),
    pricing: pricing
      ? {
          eur_huf_rate: pricing.eurHufRate,
          margin_percent_huf: pricing.marginPercentHuf,
          margin_percent_eur: pricing.marginPercentEur,
          include_shipping: pricing.includeShipping,
          huf_rounding: pricing.hufRounding,
        }
      : null,
    catalog: {
      imported_variants: variants?.length ?? 0,
      producers: producers.size,
    },
    tire_types: Object.entries(TOMKET_TIRE_TYPES).map(([code, info]) => ({
      code,
      label: info.label,
    })),
    status: await readTomketStatus(req.scope),
  })
}
