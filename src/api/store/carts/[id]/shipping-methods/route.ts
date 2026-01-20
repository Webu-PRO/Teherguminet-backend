import { addShippingMethodToCartWorkflow } from "@medusajs/core-flows"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  remoteQueryObjectFromString,
} from "@medusajs/framework/utils"
import {
  computeCartTotalWeightKg,
  isWeightBasedProviderId,
} from "../../../../../lib/cart-weight"

type AddShippingMethodPayload = {
  option_id: string
  data?: Record<string, unknown>
  additional_data?: Record<string, unknown>
}

const resolveShippingOptionProviderId = async (
  scope: { resolve: (key: string) => unknown },
  optionId: string
) => {
  const query = scope.resolve(
    ContainerRegistrationKeys.QUERY
  ) as {
    graph: (input: {
      entity: string
      fields: string[]
      filters: Record<string, unknown>
    }) => Promise<{ data: Array<{ provider_id?: string | null }> }>
  }

  const { data } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "provider_id"],
    filters: { id: optionId },
  })

  return data?.[0]?.provider_id ?? null
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const payload = req.validatedBody as AddShippingMethodPayload
  const providerId = await resolveShippingOptionProviderId(
    req.scope,
    payload.option_id
  )
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
