import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listShippingOptionsForCartWithPricingWorkflow } from "@medusajs/core-flows"

type ShippingOptionsQuery = {
  cart_id?: string
  is_return?: string | boolean
}

const readQueryValue = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim().length) {
    return value
  }

  if (Array.isArray(value)) {
    const first = value.find(
      (entry) => typeof entry === "string" && entry.trim().length
    )
    return typeof first === "string" ? first : undefined
  }

  return undefined
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const filterable =
    (req.filterableFields || {}) as ShippingOptionsQuery
  const query = req.query as Record<string, unknown>
  const cartId = readQueryValue(query.cart_id ?? filterable.cart_id)

  if (!cartId) {
    res.status(400).json({
      message: "cart_id query param is required.",
    })
    return
  }

  const isReturnRaw = query.is_return ?? filterable.is_return

  const workflow = listShippingOptionsForCartWithPricingWorkflow(
    req.scope
  )
  const { result: shipping_options } = await workflow.run({
    input: {
      cart_id: cartId,
      is_return: isReturnRaw === "true" || isReturnRaw === true,
    },
  })

  res.json({ shipping_options })
}
