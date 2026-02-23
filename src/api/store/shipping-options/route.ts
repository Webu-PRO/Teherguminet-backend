import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  listShippingOptionsForCartWithPricingWorkflow,
  listShippingOptionsForCartWorkflow,
} from "@medusajs/core-flows"
import {
  computeCartTotalWeightKg,
  isWeightBasedProviderId,
} from "../../../lib/cart-weight"
import {
  cartContainsGepekItems,
  isAllowedShippingOptionForGepek,
} from "../../../lib/gepek-cart-rules"

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

  const baseWorkflow = listShippingOptionsForCartWorkflow(req.scope)
  const { result: baseOptions } = await baseWorkflow.run({
    input: {
      cart_id: cartId,
      is_return: isReturnRaw === "true" || isReturnRaw === true,
    },
  })

  if (!baseOptions?.length) {
    res.json({ shipping_options: [] })
    return
  }

  const hasGepekItems = await cartContainsGepekItems(req.scope, cartId)
  const eligibleOptions = hasGepekItems
    ? baseOptions.filter((option) =>
        isAllowedShippingOptionForGepek(option)
      )
    : baseOptions

  if (!eligibleOptions.length) {
    res.json({ shipping_options: [] })
    return
  }

  const hasWeightBasedOption = eligibleOptions.some((option) =>
    isWeightBasedProviderId(option.provider_id)
  )
  const totalWeightKg = hasWeightBasedOption
    ? await computeCartTotalWeightKg(req.scope, cartId)
    : null
  const options = eligibleOptions.map((option) => ({
    id: option.id,
    ...(totalWeightKg
      ? isWeightBasedProviderId(option.provider_id)
        ? { data: { total_weight_kg: totalWeightKg } }
        : {}
      : {}),
  }))

  const pricingWorkflow = listShippingOptionsForCartWithPricingWorkflow(
    req.scope
  )
  const { result: shipping_options } = await pricingWorkflow.run({
    input: {
      cart_id: cartId,
      is_return: isReturnRaw === "true" || isReturnRaw === true,
      options,
    },
  })

  res.json({ shipping_options })
}
