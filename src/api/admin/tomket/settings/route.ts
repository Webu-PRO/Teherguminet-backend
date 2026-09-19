import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { resolveTomketPricing } from "../../../../lib/tomket-fx"
import {
  parseTomketSettingsInput,
  readTomketSettings,
  resolveTomketSettings,
  TomketSettingsValidationError,
  writeTomketSettings,
} from "../../../../lib/tomket-settings"

type SettingsBody = {
  marginPercentHuf?: number | string | null
  marginPercentEur?: number | string | null
  eurHufMarkupPercent?: number | string | null
  includeShipping?: boolean | string | null
  hufRounding?: number | string | null
  autoForwardPaidOrders?: boolean | string | null
}

/**
 * Saves the operator's pricing settings. Empty/null fields fall back to the
 * TOMKET_* env defaults. The next stock sync (every 15 minutes) re-prices the
 * catalogue with the new values, so nothing needs a redeploy.
 */
export async function POST(
  req: MedusaRequest<SettingsBody>,
  res: MedusaResponse
) {
  const body = (req.body ?? {}) as Record<string, unknown>

  let parsed
  try {
    parsed = parseTomketSettingsInput(body)
  } catch (error) {
    if (error instanceof TomketSettingsValidationError) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, error.message)
    }
    throw error
  }

  const settings = await writeTomketSettings(req.scope, parsed)
  const resolved = resolveTomketSettings(settings)
  const pricing = await resolveTomketPricing(req.scope, { allowLiveFetch: false })

  res.status(200).json({
    settings,
    resolved,
    configured: Boolean(pricing.config),
    missing: pricing.missing,
    pricing: pricing.config
      ? {
          eur_huf_rate: pricing.config.eurHufRate,
          margin_percent_huf: pricing.config.marginPercentHuf,
          margin_percent_eur: pricing.config.marginPercentEur,
          include_shipping: pricing.config.includeShipping,
          huf_rounding: pricing.config.hufRounding,
        }
      : null,
  })
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const settings = await readTomketSettings(req.scope)
  res.status(200).json({ settings, resolved: resolveTomketSettings(settings) })
}
