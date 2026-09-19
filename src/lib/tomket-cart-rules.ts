import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { parseTomketSku } from "./tomket"
import { TOMKET_PROVIDER_ID } from "./tomket-shipping"

/**
 * Checkout rule for dropship tyres: a cart that holds a Tomket tyre ships
 * with the Tomket option (the supplier delivers straight to the buyer) and
 * nothing else; a cart without one never sees the Tomket option. Mirrors
 * the machine ("Gépkínálat") rule in gepek-cart-rules.ts and is enforced
 * in both places that rule is: the store shipping-options listing and the
 * add-shipping-method route.
 */

type ScopedContainer = { resolve: (key: string) => unknown }

type CartItemLike = {
  id?: string | null
  variant_sku?: string | null
  variant?: {
    sku?: string | null
    metadata?: Record<string, unknown> | null
  } | null
  metadata?: Record<string, unknown> | null
}

const readInternalId = (metadata?: Record<string, unknown> | null) => {
  const value = metadata?.tomket_internal_id
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export const isTomketCartItem = (item: CartItemLike | null | undefined) => {
  if (!item) {
    return false
  }
  return Boolean(
    parseTomketSku(item.variant_sku) ||
      parseTomketSku(item.variant?.sku) ||
      readInternalId(item.variant?.metadata) ||
      readInternalId(item.metadata)
  )
}

export const cartContainsTomketItems = async (
  scope: ScopedContainer,
  cartId: string
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (input: {
      entity: string
      fields: string[]
      filters: Record<string, unknown>
    }) => Promise<{ data?: unknown[] }>
  }

  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "items.id",
      "items.variant_sku",
      "items.metadata",
      "items.variant.sku",
      "items.variant.metadata",
    ],
    filters: { id: cartId },
  })

  const cart = data?.[0] as { items?: CartItemLike[] | null } | undefined
  return (cart?.items ?? []).some((item) => isTomketCartItem(item))
}

type CheckoutOptionLike = {
  provider_id?: string | null
  name?: string | null
}

/**
 * The checkout-side test is stricter than the fulfillment-side one in
 * tomket.ts: the provider id, or the word "tomket" in the name for a legacy
 * row, never a generic token like "dropship" that another carrier's option
 * could carry.
 */
export const isTomketCheckoutOption = (
  option: CheckoutOptionLike | null | undefined
) =>
  Boolean(
    option &&
      (option.provider_id === TOMKET_PROVIDER_ID ||
        (option.name ?? "").toLowerCase().includes("tomket"))
  )

/**
 * Pure: which of the cart's candidate options remain selectable. A Tomket
 * tyre in the cart wins over every other rule (the machine rule included):
 * the supplier delivers the tyre, the shop ships anything else in the order
 * itself, and the shopper pays the one Tomket shipping price.
 */
export const filterShippingOptionsForTomket = <T extends CheckoutOptionLike>(
  options: T[],
  hasTomketItems: boolean
): T[] =>
  hasTomketItems
    ? options.filter((option) => isTomketCheckoutOption(option))
    : options.filter((option) => !isTomketCheckoutOption(option))

export const TOMKET_ONLY_MESSAGE =
  "Tomket termék esetén csak a Tomket szállítás választható: a gumit a beszállító raktárából közvetlenül Önnek szállítjuk."

export const TOMKET_NOT_APPLICABLE_MESSAGE =
  "A Tomket szállítás csak Tomket termékekhez választható."
