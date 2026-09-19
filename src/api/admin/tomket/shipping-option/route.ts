import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ensureTomketShippingOption } from "../../../../lib/tomket-shipping"

/** Creates the admin-only "Tomket dropship" shipping option (idempotent). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { option, created } = await ensureTomketShippingOption(req.scope)
  res.status(created ? 201 : 200).json({ shipping_option: option, created })
}
