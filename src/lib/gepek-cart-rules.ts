import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isGlsShippingOption } from "./gls"
import { isTomketShippingOption } from "./tomket"

type ScopedContainer = {
  resolve: (key: string) => unknown
}

type GraphQueryService = {
  graph: (input: {
    entity: string
    fields: string[]
    filters: Record<string, unknown>
  }) => Promise<{ data: unknown[] }>
}

type CategoryLike = {
  handle?: string | null
  name?: string | null
}

type CartItemLike = {
  product?: {
    categories?: CategoryLike[] | null
  } | null
  variant?: {
    product?: {
      categories?: CategoryLike[] | null
    } | null
  } | null
}

type CartLike = {
  items?: CartItemLike[] | null
}

export type GepekShippingOptionLike = {
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
}

const GEPKINALAT_TOKENS = ["gepek", "gepkinalat"]

const normalizeToken = (value?: string | null) => {
  if (!value) {
    return ""
  }

  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

const hasGepekCategoryToken = (value?: string | null) => {
  const token = normalizeToken(value)
  return GEPKINALAT_TOKENS.some((entry) => token.includes(entry))
}

const collectStringValues = (value: unknown, target: string[]) => {
  if (typeof value === "string") {
    const normalized = normalizeToken(value)
    if (normalized) {
      target.push(normalized)
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectStringValues(entry, target))
    return
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => collectStringValues(entry, target))
  }
}

const buildOptionSearchText = (option?: GepekShippingOptionLike | null) => {
  if (!option) {
    return ""
  }

  const tokens: string[] = []
  const rootValues = [
    option.id,
    option.name,
    option.provider_id,
    option.shipping_option_type_id,
    option.type?.id,
    option.type?.code,
    option.type?.label,
    option.type?.description,
  ]

  rootValues.forEach((value) => {
    if (typeof value === "string") {
      const normalized = normalizeToken(value)
      if (normalized) {
        tokens.push(normalized)
      }
    }
  })

  collectStringValues(option.data ?? null, tokens)
  collectStringValues(option.metadata ?? null, tokens)

  return tokens.join(" ")
}

const isPickupOption = (option?: GepekShippingOptionLike | null) => {
  if (!option) {
    return false
  }

  const code = normalizeToken(option.type?.code)
  if (code === "pickup") {
    return true
  }

  const text = buildOptionSearchText(option)
  return (
    text.includes("pickup") ||
    text.includes("helyszini atvetel") ||
    text.includes("szemelyes atvetel")
  )
}

const isMagyarPostaOption = (option?: GepekShippingOptionLike | null) => {
  if (!option) {
    return false
  }

  const providerToken = normalizeToken(option.provider_id)
  if (
    providerToken.includes("magyar-posta") ||
    providerToken.includes("magyar_posta")
  ) {
    return true
  }

  const text = buildOptionSearchText(option)
  return (
    text.includes("magyar posta") ||
    text.includes("magyarposta") ||
    text.includes("mpl")
  )
}

const isOwnDeliveryOption = (option?: GepekShippingOptionLike | null) => {
  if (!option) {
    return false
  }

  const providerToken = normalizeToken(option.provider_id)
  if (
    providerToken === "manual" ||
    providerToken.startsWith("manual_") ||
    providerToken.endsWith("_manual") ||
    providerToken.includes("teherguminet")
  ) {
    return true
  }

  const text = buildOptionSearchText(option)
  return (
    text.includes("sajat szallitas") ||
    (text.includes("sajat") &&
      (text.includes("hazhoz") || text.includes("szallit")))
  )
}

export const isAllowedShippingOptionForGepek = (
  option?: GepekShippingOptionLike | null
) => {
  if (!option) {
    return false
  }

  if (
    isGlsShippingOption(option) ||
    isTomketShippingOption(option) ||
    isMagyarPostaOption(option)
  ) {
    return false
  }

  if (isPickupOption(option)) {
    return true
  }

  return isOwnDeliveryOption(option)
}

const resolveQueryService = (
  scope: ScopedContainer
): GraphQueryService => {
  return scope.resolve(
    ContainerRegistrationKeys.QUERY
  ) as GraphQueryService
}

const extractItemCategories = (item?: CartItemLike | null) => {
  const direct = item?.product?.categories ?? []
  const fromVariant = item?.variant?.product?.categories ?? []
  return [...direct, ...fromVariant]
}

export const resolveCartItemCategoryMix = async (
  scope: ScopedContainer,
  cartId: string
) => {
  const query = resolveQueryService(scope)

  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "items.id",
      "items.product.categories.handle",
      "items.product.categories.name",
    ],
    filters: { id: cartId },
  })

  const cart = data?.[0] as CartLike | undefined
  const items = Array.isArray(cart?.items) ? cart.items : []

  let hasGepek = false
  let hasNonGepek = false

  for (const item of items) {
    const categories = extractItemCategories(item)

    if (!categories.length) {
      hasNonGepek = true
    } else if (
      categories.some((category) =>
        hasGepekCategoryToken(category?.handle || category?.name)
      )
    ) {
      hasGepek = true
    } else {
      hasNonGepek = true
    }

    if (hasGepek && hasNonGepek) {
      break
    }
  }

  return {
    hasGepek,
    hasNonGepek,
  }
}

export const cartContainsGepekItems = async (
  scope: ScopedContainer,
  cartId: string
) => {
  const { hasGepek } = await resolveCartItemCategoryMix(scope, cartId)
  return hasGepek
}

export const resolveShippingOptionForRules = async (
  scope: ScopedContainer,
  optionId: string
) => {
  const query = resolveQueryService(scope)

  const { data } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "provider_id",
      "shipping_option_type_id",
      "type.id",
      "type.code",
      "type.label",
      "type.description",
      "data",
      "metadata",
    ],
    filters: { id: optionId },
  })

  const option = data?.[0] as GepekShippingOptionLike | undefined
  return option ?? null
}
