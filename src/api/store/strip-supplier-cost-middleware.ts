import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { stripSensitiveMetadata } from "../../lib/strip-supplier-cost"

/**
 * Removes supplier purchase data from every Store API JSON response
 * (see lib/strip-supplier-cost.ts). Registered for all /store routes.
 */
export function stripSupplierCostMiddleware(_req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const json = res.json.bind(res)
  res.json = ((body: unknown) => json(stripSensitiveMetadata(body))) as typeof res.json
  next()
}
