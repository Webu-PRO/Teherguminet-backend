import { addShippingMethodToCartWorkflow } from "@medusajs/core-flows"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  remoteQueryObjectFromString,
} from "@medusajs/framework/utils"
import {
  computeCartTotalWeightKg,
  isWeightBasedProviderId,
} from "../../../../../lib/cart-weight"
import {
  cartContainsGepekItems,
  isAllowedShippingOptionForGepek,
  isMagyarPostaShippingOption,
  resolveShippingOptionForRules,
} from "../../../../../lib/gepek-cart-rules"

type AddShippingMethodPayload = {
  option_id: string
  data?: Record<string, unknown>
  additional_data?: Record<string, unknown>
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const payload = req.validatedBody as AddShippingMethodPayload
  const option = await resolveShippingOptionForRules(
    req.scope,
    payload.option_id
  )

  if (isMagyarPostaShippingOption(option)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "A Magyar Posta szállítási mód jelenleg nem elérhető."
    )
  }

  const hasGepekItems = await cartContainsGepekItems(req.scope, req.params.id)

  if (hasGepekItems && !isAllowedShippingOptionForGepek(option)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Gépkínálat termék esetén csak a Saját szállítás és a Helyszíni átvétel választható."
    )
  }

  const providerId = option?.provider_id ?? null
  const shouldAttachWeight = isWeightBasedProviderId(providerId)
  const totalWeightKg = shouldAttachWeight
    ? await computeCartTotalWeightKg(req.scope, req.params.id)
    : null

  const data = { ...(payload.data ?? {}) }
  if (
    shouldAttachWeight &&
    totalWeightKg &&
    data.total_weight_kg == null &&
    data.totalWeightKg == null
  ) {
    data.total_weight_kg = totalWeightKg
  }

  await addShippingMethodToCartWorkflow(req.scope).run({
    input: {
      options: [{ id: payload.option_id, data }],
      cart_id: req.params.id,
      additional_data: payload.additional_data,
    },
  })

  const remoteQuery = req.scope.resolve(
    ContainerRegistrationKeys.REMOTE_QUERY
  ) as (input: unknown) => Promise<unknown[]>
  const queryObject = remoteQueryObjectFromString({
    entryPoint: "cart",
    variables: { filters: { id: req.params.id } },
    fields: req.queryConfig.fields,
  })
  const [cart] = await remoteQuery(queryObject)

  res.status(200).json({ cart })
}
