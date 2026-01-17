import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type {
  FulfillmentDTO,
  IFulfillmentModuleService,
  Logger,
  OrderDTO,
  OrderShippingMethodDTO,
  Query,
} from "@medusajs/types"

import {
  createGlsShipment,
  isGlsShippingOption,
  isGlsShippingMethod,
  readGlsPickupFromMetadata,
  resolveGlsConfig,
} from "../lib/gls"

type FulfillmentEventPayload = {
  id: string
}

const GLS_FULFILLMENT_METADATA_KEY = "gls_shipment"

const resolveLogger = (container: SubscriberArgs["container"]) => {
  try {
    return container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  } catch {
    return undefined
  }
}

const resolveShippingMethod = (
  order: OrderDTO,
  fulfillment: FulfillmentDTO
): OrderShippingMethodDTO | null => {
  const methods = order.shipping_methods ?? []

  if (!methods.length) {
    return null
  }

  if (fulfillment.shipping_option_id) {
    const match = methods.find(
      (method) =>
        method.shipping_option_id === fulfillment.shipping_option_id
    )

    if (match) {
      return match
    }
  }

  return methods.length === 1 ? methods[0] : methods.at(-1) ?? null
}

const isPickupLike = (value?: string | null) => {
  if (!value) {
    return false
  }

  const normalized = value.toLowerCase()
  return (
    normalized.includes("pickup") ||
    normalized.includes("csomagpont") ||
    normalized.includes("parcelshop")
  )
}

const extractMetadata = (
  fulfillment: FulfillmentDTO
): Record<string, unknown> => {
  return (fulfillment.metadata as Record<string, unknown>) ?? {}
}

export default async function fulfillmentCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<FulfillmentEventPayload>) {
  const logger = resolveLogger(container)
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const fulfillmentModuleService =
    container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT)

  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    fields: [
      "id",
      "provider_id",
      "shipping_option_id",
      "metadata",
      "data",
      "delivery_address.*",
      "shipping_option.id",
      "shipping_option.name",
      "shipping_option.provider_id",
      "shipping_option.shipping_option_type_id",
      "shipping_option.type.id",
      "shipping_option.type.code",
      "shipping_option.type.label",
      "shipping_option.type.description",
      "shipping_option.data",
      "shipping_option.metadata",
      "order.id",
      "order.display_id",
      "order.email",
      "order.currency_code",
      "order.total",
      "order.metadata",
      "order.shipping_address.*",
      "order.billing_address.*",
      "order.shipping_methods.*",
    ],
    filters: {
      id: data.id,
    },
  })

  const fulfillment = fulfillments?.[0] as FulfillmentDTO & {
    order?: OrderDTO
    shipping_option?: {
      id?: string | null
      name?: string | null
      provider_id?: string | null
      shipping_option_type_id?: string | null
      type?: {
        id?: string | null
        code?: string | null
        label?: string | null
        description?: string | null
      } | null
      data?: Record<string, unknown> | null
      metadata?: Record<string, unknown> | null
    } | null
  }

  if (!fulfillment || !fulfillment.order) {
    logger?.warn?.(
      `GLS: fulfillment ${data.id} missing order relation`
    )
    return
  }

  const order = fulfillment.order
  const shippingMethod = resolveShippingMethod(order, fulfillment)
  const matchesGls =
    isGlsShippingOption(fulfillment.shipping_option) ||
    isGlsShippingMethod(shippingMethod)
  if (!matchesGls) {
    return
  }

  const glsPickup = readGlsPickupFromMetadata(order.metadata)
  const pickupHint =
    isPickupLike(shippingMethod?.name) ||
    isPickupLike(fulfillment.shipping_option?.name) ||
    isPickupLike(fulfillment.shipping_option?.type?.label) ||
    isPickupLike(fulfillment.shipping_option?.type?.description)
  if (!glsPickup && pickupHint) {
    logger?.warn?.(
      `GLS: missing pickup point for fulfillment ${fulfillment.id}`
    )
    return
  }

  const metadata = extractMetadata(fulfillment)
  if (metadata[GLS_FULFILLMENT_METADATA_KEY]) {
    return
  }

  const { config, missing } = resolveGlsConfig()
  if (!config) {
    logger?.warn?.(
      `GLS: missing config (${missing.join(", ")})`
    )
    return
  }

  try {
    const result = await createGlsShipment(
      {
        order,
        fulfillment,
        pickup: glsPickup ?? undefined,
      },
      config
    )

    await fulfillmentModuleService.updateFulfillment(fulfillment.id, {
      metadata: {
        ...metadata,
        [GLS_FULFILLMENT_METADATA_KEY]: {
          created_at: new Date().toISOString(),
          request: result.request,
          response: result.response,
        },
      },
    })
  } catch (error) {
    logger?.error?.(
      `GLS: failed to create shipment for fulfillment ${fulfillment.id}`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: "fulfillment.created",
}
