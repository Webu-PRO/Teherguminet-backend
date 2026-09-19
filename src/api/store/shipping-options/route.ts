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
import {
  cartContainsTomketItems,
  filterShippingOptionsForTomket,
} from "../../../lib/tomket-cart-rules"
import { ensureTomketShippingOption } from "../../../lib/tomket-shipping"

type ShippingOptionsQuery = {
  cart_id?: string
  is_return?: string | boolean
}

type ShippingOptionLike = {
  id?: string | null
}

type LoggerLike = {
  warn?: (...args: unknown[]) => void
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

const resolveLogger = (req: MedusaRequest): LoggerLike | null => {
  try {
    return (req.scope as { resolve?: (name: string) => unknown })?.resolve?.(
      "logger"
    ) as LoggerLike
  } catch {
    return null
  }
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

  const isReturn = isReturnRaw === "true" || isReturnRaw === true
  const listBaseOptions = async () => {
    const { result } = await listShippingOptionsForCartWorkflow(req.scope).run({
      input: { cart_id: cartId, is_return: isReturn },
    })
    return result ?? []
  }

  let baseOptions = await listBaseOptions()

  // Dropship tyres ship from the supplier: with a Tomket tyre in the cart
  // only the Tomket option is offered, without one it is never offered.
  const hasTomketItems = await cartContainsTomketItems(req.scope, cartId)

  // A Tomket cart with no shopper-facing Tomket option would have nothing
  // to choose (the rule below hides everything else), so create or upgrade
  // the option on the spot — once; later requests find it in the list.
  if (
    hasTomketItems &&
    !isReturn &&
    !filterShippingOptionsForTomket(baseOptions, true).length
  ) {
    try {
      await ensureTomketShippingOption(req.scope)
      baseOptions = await listBaseOptions()
    } catch (error) {
      resolveLogger(req)?.warn?.(
        "[store/shipping-options] could not ensure the Tomket shipping option",
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  if (!baseOptions?.length) {
    res.json({ shipping_options: [] })
    return
  }

  const hasGepekItems = await cartContainsGepekItems(req.scope, cartId)
  const gepekFiltered = hasGepekItems
    ? baseOptions.filter((option) =>
        isAllowedShippingOptionForGepek(option)
      )
    : baseOptions

  const eligibleOptions = filterShippingOptionsForTomket(
    gepekFiltered,
    hasTomketItems
  )

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

  const pricingWorkflow = listShippingOptionsForCartWithPricingWorkflow(req.scope)
  const pricingInput = {
    cart_id: cartId,
    is_return: isReturn,
  }

  try {
    const { result: shipping_options } = await pricingWorkflow.run({
      input: {
        ...pricingInput,
        options,
      },
    })

    res.json({ shipping_options })
    return
  } catch (pricingError) {
    const settled = await Promise.allSettled(
      options.map(async (option) => {
        const { result } = await pricingWorkflow.run({
          input: {
            ...pricingInput,
            options: [option],
          },
        })

        return Array.isArray(result) ? (result[0] as ShippingOptionLike) : null
      })
    )

    const pricedById = new Map<string, ShippingOptionLike>()
    let recoveredCount = 0

    for (const result of settled) {
      if (result.status !== "fulfilled") {
        continue
      }

      const option = result.value
      if (!option) {
        continue
      }
      const optionId =
        typeof option.id === "string" && option.id.trim().length
          ? option.id.trim()
          : null

      if (!optionId) {
        continue
      }

      pricedById.set(optionId, option)
      recoveredCount += 1
    }

    const logger = resolveLogger(req)
    logger?.warn?.(
      "[store/shipping-options] pricing workflow failed, returning partial/fallback options",
      {
        cartId,
        optionCount: options.length,
        recoveredCount,
        error:
          pricingError instanceof Error
            ? pricingError.message
            : String(pricingError),
      }
    )

    const shipping_options = eligibleOptions.map((option) => {
      const optionId =
        typeof option.id === "string" && option.id.trim().length
          ? option.id.trim()
          : null

      if (!optionId) {
        return option
      }

      return (pricedById.get(optionId) as typeof option) ?? option
    })

    res.json({ shipping_options })
  }
}
