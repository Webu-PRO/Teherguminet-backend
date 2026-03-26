import type { OrderShippingMethodDTO } from "@medusajs/types"

const normalizeToken = (value: unknown) => {
  if (typeof value !== "string") {
    return ""
  }

  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
    Object.values(value).forEach((entry) =>
      collectStringValues(entry, target)
    )
  }
}

const buildShippingMethodSearchText = (
  method?: OrderShippingMethodDTO | null
) => {
  if (!method) {
    return ""
  }

  const raw = method as unknown as Record<string, unknown>
  const tokens: string[] = []
  const rootValues = [
    method.name,
    raw.provider_id,
    raw.shipping_option_id,
    raw.shipping_option_type_id,
    (raw.type as Record<string, unknown> | undefined)?.code,
    (raw.type as Record<string, unknown> | undefined)?.label,
    (raw.type as Record<string, unknown> | undefined)?.description,
  ]

  rootValues.forEach((value) => {
    const normalized = normalizeToken(value)
    if (normalized) {
      tokens.push(normalized)
    }
  })

  collectStringValues(raw.data ?? null, tokens)
  collectStringValues(raw.metadata ?? null, tokens)

  return tokens.join(" ")
}

export const isPickupShippingMethod = (
  method?: OrderShippingMethodDTO | null
) => {
  const text = buildShippingMethodSearchText(method)
  return (
    text.includes("pickup") ||
    text.includes("helyszini atvetel") ||
    text.includes("szemelyes atvetel") ||
    text.includes("telephelyi atvetel")
  )
}

export const isOwnDeliveryShippingMethod = (
  method?: OrderShippingMethodDTO | null
) => {
  if (!method) {
    return false
  }

  const raw = method as unknown as Record<string, unknown>
  const providerToken = normalizeToken(raw.provider_id)
  const text = buildShippingMethodSearchText(method)

  if (isPickupShippingMethod(method)) {
    return false
  }

  if (
    providerToken === "manual" ||
    providerToken.startsWith("manual_") ||
    providerToken.endsWith("_manual") ||
    providerToken.includes("teherguminet")
  ) {
    return true
  }

  return (
    text.includes("sajat szallitas") ||
    (text.includes("sajat") &&
      (text.includes("hazhoz") || text.includes("szallit")))
  )
}

