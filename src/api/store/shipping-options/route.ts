import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listShippingOptionsForCartWithPricingWorkflow } from "@medusajs/core-flows"

type ShippingOptionsQuery = {
  cart_id: string
  is_return?: string | boolean
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { cart_id, is_return } =
    (req.filterableFields || {}) as ShippingOptionsQuery

  const workflow = listShippingOptionsForCartWithPricingWorkflow(
    req.scope
  )
  const { result: shipping_options } = await workflow.run({
    input: {
      cart_id,
      is_return: is_return === "true" || is_return === true,
    },
  })

  res.json({ shipping_options })
}
