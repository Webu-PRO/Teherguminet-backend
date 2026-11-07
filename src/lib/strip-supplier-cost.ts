/**
 * Supplier purchase data (Tomket net cost, Tomket shipping fee, Tomket internal id)
 * lives in variant/product `metadata` for internal pricing. The Store API returns
 * `metadata` by default, so without this filter anyone holding the public
 * publishable key could read our purchase prices.
 *
 * `stripSensitiveMetadata` walks a response body and removes those keys from every
 * `metadata` object it finds. Keys a shopper may see (EAN, size, EU label, DOT…) stay.
 */

const SENSITIVE_KEY = /cost|purchase|beszerz|margin|_shipping_eur_net$|(^|_)internal_id$|(^|_)supplier_id$/i

export function isSensitiveMetadataKey(key: string): boolean {
  return SENSITIVE_KEY.test(key)
}

export function stripSensitiveMetadata<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value
  if (seen.has(value as object)) return value
  seen.add(value as object)

  if (Array.isArray(value)) {
    for (const item of value) stripSensitiveMetadata(item, seen)
    return value
  }

  const record = value as Record<string, unknown>
  for (const [key, child] of Object.entries(record)) {
    if (key === "metadata" && child && typeof child === "object" && !Array.isArray(child)) {
      for (const metaKey of Object.keys(child as Record<string, unknown>)) {
        if (isSensitiveMetadataKey(metaKey)) delete (child as Record<string, unknown>)[metaKey]
      }
    }
    stripSensitiveMetadata(child, seen)
  }
  return value
}
