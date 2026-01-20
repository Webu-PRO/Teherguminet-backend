import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type CartItem = {
  quantity?: unknown
  requires_shipping?: boolean
  weight?: unknown
  metadata?: Record<string, unknown> | null
  variant?: {
    weight?: unknown
    metadata?: Record<string, unknown> | null
  } | null
}

type CartRecord = {
  items?: CartItem[] | null
}

const resolveNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    const numeric = record.numeric
    if (typeof numeric === "number" && Number.isFinite(numeric)) {
      return numeric
    }

    const raw = record.value
    if (raw !== undefined) {
      const parsed = resolveNumber(raw)
      if (parsed !== null) {
        return parsed
      }
    }

    const valueOf = (value as { valueOf?: () => unknown }).valueOf
    if (typeof valueOf === "function") {
      const parsed = valueOf.call(value)
      if (parsed !== value) {
        const resolved = resolveNumber(parsed)
        if (resolved !== null) {
          return resolved
        }
      }
    }

    const toJson = (value as { toJSON?: () => unknown }).toJSON
    if (typeof toJson === "function") {
      const parsed = toJson.call(value)
      if (parsed !== value) {
        const resolved = resolveNumber(parsed)
        if (resolved !== null) {
          return resolved
        }
      }
    }
  }

  return null
}

const resolveWeightFromMetadata = (
  metadata?: Record<string, unknown> | null
) => {
  if (!metadata) {
    return null
  }

  const weightKg = resolveNumber(
    metadata.weight_kg ??
      metadata.weightKg ??
      metadata.gls_weight_kg
  )
  if (weightKg !== null) {
    return weightKg
  }

  const weightG = resolveNumber(
    metadata.weight_g ??
      metadata.weightG ??
      metadata.gls_weight_g
  )
  if (weightG !== null) {
    return weightG / 1000
  }

  const rawWeight = resolveNumber(metadata.weight)
  return rawWeight
}

const resolveItemWeightKg = (item: CartItem) => {
  const variant = item.variant ?? null

  const variantWeight = resolveNumber(variant?.weight)
  if (variantWeight !== null) {
    return variantWeight
  }

  const itemWeight = resolveNumber(item.weight)
  if (itemWeight !== null) {
    return itemWeight
  }

  const itemMetadataWeight = resolveWeightFromMetadata(item.metadata ?? null)
  if (itemMetadataWeight !== null) {
    return itemMetadataWeight
  }

  const variantMetadataWeight = resolveWeightFromMetadata(
    variant?.metadata ?? null
  )
  if (variantMetadataWeight !== null) {
    return variantMetadataWeight
  }

  return null
}

export const computeCartTotalWeightKg = async (
  scope: { resolve: (key: string) => unknown },
  cartId: string
) => {
  const query = scope.resolve(
    ContainerRegistrationKeys.QUERY
  ) as {
    graph: (input: {
      entity: string
      fields: string[]
      filters: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }

  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "items.*",
      "items.variant.weight",
      "items.variant.metadata",
    ],
    filters: { id: cartId },
  })

  const cart = data?.[0] as CartRecord | undefined
  const items = Array.isArray(cart?.items) ? cart?.items : []

  if (!items.length) {
    return null
  }

  let total = 0
  let hasWeight = false

  for (const item of items) {
    if (item?.requires_shipping === false) {
      continue
    }

    const quantity = resolveNumber(item?.quantity) ?? 1
    const weightKg = resolveItemWeightKg(item)

    if (!weightKg || !quantity) {
      continue
    }

    total += weightKg * quantity
    hasWeight = true
  }

  return hasWeight ? total : null
}

export const isWeightBasedProviderId = (
  providerId?: string | null
) => {
  if (!providerId) {
    return false
  }

  const normalized = providerId.toLowerCase()
  return (
    normalized.startsWith("gls_") ||
    normalized.includes("teherguminet")
  )
}
