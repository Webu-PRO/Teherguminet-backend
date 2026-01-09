import crypto from "crypto"
import type {
  FulfillmentDTO,
  OrderAddressDTO,
  OrderDTO,
  OrderLineItemDTO,
  OrderShippingMethodDTO,
} from "@medusajs/types"

type MagyarPostaConfig = {
  baseUrl: string
  username: string
  password: string
  timeoutMs: number
}

export type MagyarPostaOrderPayload = {
  tire: string
  quantity: number
  country: string
  customer: string
  street: string
  city: string
  zip: string
  phone: string
  orderid: string
  email?: string
  shipdate?: string
  note?: string
}

export type MagyarPostaOrderResponse = {
  raw: string
  parsed:
    | {
        type: "success"
        order_id?: string
        internal_order_id?: string
        status?: string
        tracking_url?: string
        warehouse?: string
        carrier?: string
        parcel_numbers?: string
      }
    | {
        type: "error"
        code?: number
        message: string
      }
}

export type MagyarPostaOrderResult = {
  request: MagyarPostaOrderPayload
  response: MagyarPostaOrderResponse
}

export type MagyarPostaRecipient = {
  customer: string
  street: string
  city: string
  zip: string
  phone: string
  country: string
  email?: string
}

export type MagyarPostaOrderItem = {
  internalId: string
  quantity: number
  lineItemIds: string[]
  source: string
}

type ShippingOptionLike = {
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

type ExpandedOrderLineItem = OrderLineItemDTO & {
  sku?: string | null
  variant?: {
    sku?: string | null
    metadata?: Record<string, unknown> | null
  } | null
}

const DEFAULT_TIMEOUT_MS = 15000

const normalizeString = (value?: string | null) => {
  if (typeof value !== "string") {
    return ""
  }

  return value.trim()
}

const normalizeOptionalString = (value?: string | null) => {
  const normalized = normalizeString(value)
  return normalized ? normalized : undefined
}

const sanitizeField = (
  value: unknown,
  maxLength: number,
  fallback?: string
) => {
  let normalized = typeof value === "string" ? value : ""
  normalized = normalized
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/[;\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!normalized && fallback) {
    normalized = fallback
  }

  if (normalized.length > maxLength) {
    normalized = normalized.slice(0, maxLength).trim()
  }

  return normalized
}

const parseCsvValues = (value?: string) => {
  if (!value) {
    return []
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const resolveConfiguredTypeIds = () =>
  parseCsvValues(process.env.MAGYAR_POSTA_SHIPPING_OPTION_TYPE_IDS)

const resolveConfiguredOptionIds = () =>
  parseCsvValues(process.env.MAGYAR_POSTA_SHIPPING_OPTION_IDS)

const hasMagyarPostaToken = (value?: string | null) => {
  if (!value) {
    return false
  }

  const normalized = value.toLowerCase()
  return (
    normalized.includes("magyar") ||
    normalized.includes("posta") ||
    normalized.includes("mpl")
  )
}

export const isMagyarPostaShippingOption = (
  option?: ShippingOptionLike | null
) => {
  if (!option) {
    return false
  }

  const configuredTypeIds = resolveConfiguredTypeIds()
  const configuredOptionIds = resolveConfiguredOptionIds()

  const optionTypeId =
    normalizeOptionalString(option.type?.id) ??
    normalizeOptionalString(option.shipping_option_type_id)
  const optionId = normalizeOptionalString(option.id)

  if (optionTypeId && configuredTypeIds.includes(optionTypeId)) {
    return true
  }

  if (optionId && configuredOptionIds.includes(optionId)) {
    return true
  }

  const tokens = [
    option.name,
    option.provider_id,
    optionId,
    option.type?.code,
    option.type?.label,
    option.type?.description,
  ].filter((value): value is string => typeof value === "string")

  if (tokens.some((value) => hasMagyarPostaToken(value))) {
    return true
  }

  const dataValues = [option.data, option.metadata]
    .filter((value): value is Record<string, unknown> => Boolean(value))
    .flatMap((record) => Object.values(record))

  return dataValues.some(
    (value) => typeof value === "string" && hasMagyarPostaToken(value)
  )
}

export const isMagyarPostaShippingMethod = (
  method?: OrderShippingMethodDTO | null
) => {
  if (!method) {
    return false
  }

  return isMagyarPostaShippingOption({
    id: method.shipping_option_id,
    name: method.name,
    data: method.data,
    metadata: method.metadata ?? undefined,
  })
}

export const resolveMagyarPostaConfig = (): {
  config?: MagyarPostaConfig
  missing: string[]
} => {
  const missing: string[] = []

  const username = normalizeString(process.env.MAGYAR_POSTA_USERNAME)
  const password = normalizeString(process.env.MAGYAR_POSTA_PASSWORD)

  if (!username) {
    missing.push("MAGYAR_POSTA_USERNAME")
  }

  if (!password) {
    missing.push("MAGYAR_POSTA_PASSWORD")
  }

  if (missing.length) {
    return { missing }
  }

  return {
    missing,
    config: {
      baseUrl:
        normalizeString(process.env.MAGYAR_POSTA_API_BASE_URL) ||
        "https://api.tomket.com/dropship/api",
      username,
      password,
      timeoutMs:
        Number(process.env.MAGYAR_POSTA_API_TIMEOUT_MS) ||
        DEFAULT_TIMEOUT_MS,
    },
  }
}

const resolveDeliveryAddress = (
  fulfillment: FulfillmentDTO,
  order: OrderDTO
): OrderAddressDTO | null => {
  const fulfillmentAddress =
    (fulfillment.delivery_address as OrderAddressDTO | null) ?? null

  return (
    fulfillmentAddress ??
    order.shipping_address ??
    order.billing_address ??
    null
  )
}

export const resolveMagyarPostaRecipient = (
  fulfillment: FulfillmentDTO,
  order: OrderDTO
): { recipient?: MagyarPostaRecipient; missing: string[] } => {
  const address = resolveDeliveryAddress(fulfillment, order)
  const missing: string[] = []

  const nameCandidate = [
    normalizeOptionalString(address?.first_name),
    normalizeOptionalString(address?.last_name),
  ]
    .filter(Boolean)
    .join(" ")
    .trim()

  const customer = sanitizeField(
    nameCandidate,
    100,
    normalizeOptionalString(address?.company) ??
      normalizeOptionalString(order.email) ??
      "Customer"
  )

  if (customer.length < 3) {
    missing.push("customer")
  }

  const streetParts = [
    normalizeOptionalString(address?.address_1),
    normalizeOptionalString(address?.address_2),
  ].filter(Boolean)

  const street = sanitizeField(streetParts.join(" "), 100)
  if (!street) {
    missing.push("street")
  }

  const city = sanitizeField(address?.city, 100)
  if (!city) {
    missing.push("city")
  }

  const zip = sanitizeField(address?.postal_code, 7).toUpperCase()
  if (!zip) {
    missing.push("zip")
  }

  const phone = sanitizeField(
    address?.phone ?? order.billing_address?.phone,
    20
  )
  if (!phone) {
    missing.push("phone")
  }

  const country = sanitizeField(
    address?.country_code,
    2
  ).toLowerCase()
  if (!country || country.length !== 2) {
    missing.push("country")
  }

  if (missing.length) {
    return { missing }
  }

  const email = sanitizeField(order.email, 100)
  return {
    recipient: {
      customer,
      street,
      city,
      zip,
      phone,
      country,
      email: email || undefined,
    },
    missing,
  }
}

const extractNumericId = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const asString = Math.trunc(value).toString()
    return /^\d{1,7}$/.test(asString) ? asString : null
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    return /^\d{1,7}$/.test(trimmed) ? trimmed : null
  }

  return null
}

const resolveItemInternalId = (item: ExpandedOrderLineItem) => {
  const metadata =
    (item.metadata as Record<string, unknown> | null) ?? {}
  const variantMetadata =
    (item.variant?.metadata as Record<string, unknown> | null) ?? {}

  const candidates = [
    { source: "metadata.tomket_internal_id", value: metadata.tomket_internal_id },
    { source: "metadata.tomket_id", value: metadata.tomket_id },
    {
      source: "metadata.magyar_posta_internal_id",
      value: metadata.magyar_posta_internal_id,
    },
    { source: "metadata.magyar_posta_id", value: metadata.magyar_posta_id },
    { source: "metadata.tire_id", value: metadata.tire_id },
    { source: "metadata.internal_id", value: metadata.internal_id },
    { source: "metadata.supplier_id", value: metadata.supplier_id },
    { source: "variant_sku", value: item.variant_sku },
    { source: "sku", value: item.sku },
    { source: "variant.sku", value: item.variant?.sku },
    {
      source: "variant.metadata.tomket_internal_id",
      value: variantMetadata.tomket_internal_id,
    },
    {
      source: "variant.metadata.tomket_id",
      value: variantMetadata.tomket_id,
    },
    {
      source: "variant.metadata.magyar_posta_internal_id",
      value: variantMetadata.magyar_posta_internal_id,
    },
    {
      source: "variant.metadata.magyar_posta_id",
      value: variantMetadata.magyar_posta_id,
    },
  ]

  for (const candidate of candidates) {
    const resolved = extractNumericId(candidate.value)
    if (resolved) {
      return { id: resolved, source: candidate.source }
    }
  }

  return { id: null, source: "" }
}

export const resolveMagyarPostaItems = (
  items: ExpandedOrderLineItem[] | null | undefined
): { items: MagyarPostaOrderItem[]; missing: string[] } => {
  const missing: string[] = []
  const grouped = new Map<string, MagyarPostaOrderItem>()

  for (const item of items ?? []) {
    const { id, source } = resolveItemInternalId(item)
    if (!id) {
      missing.push(item.id)
      continue
    }

    const quantity = Math.max(
      1,
      Number.isFinite(item.quantity) ? item.quantity : 1
    )

    const existing = grouped.get(id)
    if (existing) {
      existing.quantity += quantity
      existing.lineItemIds.push(item.id)
      continue
    }

    grouped.set(id, {
      internalId: id,
      quantity,
      lineItemIds: [item.id],
      source,
    })
  }

  return {
    items: Array.from(grouped.values()),
    missing,
  }
}

export const buildMagyarPostaOrderId = (
  order: OrderDTO,
  item: MagyarPostaOrderItem
) => {
  const hash = crypto
    .createHash("sha1")
    .update(`${order.id}:${item.internalId}`)
    .digest("hex")

  return `mp${hash.slice(0, 13)}`
}

const parseOrderResponse = (text: string): MagyarPostaOrderResponse => {
  const trimmed = text.trim()
  const line = trimmed.split(/\r?\n/).find(Boolean) ?? ""
  if (!line) {
    return {
      raw: text,
      parsed: {
        type: "error",
        message: "Empty response",
      },
    }
  }

  if (/^error\s+/i.test(line)) {
    const match = line.match(/^error\s+(\d+)/i)
    return {
      raw: line,
      parsed: {
        type: "error",
        code: match ? Number(match[1]) : undefined,
        message: line,
      },
    }
  }

  const [orderId, internalOrderId, status, trackingUrl, warehouse, carrier, parcelNumbers] =
    line.split(";")

  return {
    raw: line,
    parsed: {
      type: "success",
      order_id: orderId || undefined,
      internal_order_id: internalOrderId || undefined,
      status: status || undefined,
      tracking_url: trackingUrl || undefined,
      warehouse: warehouse || undefined,
      carrier: carrier || undefined,
      parcel_numbers: parcelNumbers || undefined,
    },
  }
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, "")

export const buildMagyarPostaOrderPayload = (input: {
  item: MagyarPostaOrderItem
  recipient: MagyarPostaRecipient
  orderId: string
  email?: string
  shipdate?: string
  note?: string
}): MagyarPostaOrderPayload => {
  const { item, recipient, orderId } = input
  const email = sanitizeField(input.email ?? recipient.email, 100) || undefined
  const note = sanitizeField(input.note, 255) || undefined
  const shipdate = sanitizeField(input.shipdate, 10)
  const normalizedShipdate =
    shipdate && /^\d{4}-\d{2}-\d{2}$/.test(shipdate)
      ? shipdate
      : undefined

  return {
    tire: item.internalId,
    quantity: item.quantity,
    country: recipient.country,
    customer: recipient.customer,
    street: recipient.street,
    city: recipient.city,
    zip: recipient.zip,
    phone: recipient.phone,
    orderid: orderId,
    email,
    shipdate: normalizedShipdate,
    note,
  }
}

export const createMagyarPostaOrder = async (
  payload: MagyarPostaOrderPayload,
  config: MagyarPostaConfig
): Promise<MagyarPostaOrderResult> => {
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/order/new`
  const authHeader = Buffer.from(
    `${config.username}:${config.password}`
  ).toString("base64")

  const params = new URLSearchParams()
  params.set("tire", payload.tire)
  params.set("quantity", String(payload.quantity))
  params.set("country", payload.country)
  params.set("customer", payload.customer)
  params.set("street", payload.street)
  params.set("city", payload.city)
  params.set("zip", payload.zip)
  params.set("phone", payload.phone)
  params.set("orderid", payload.orderid)
  if (payload.email) {
    params.set("email", payload.email)
  }
  if (payload.shipdate) {
    params.set("shipdate", payload.shipdate)
  }
  if (payload.note) {
    params.set("note", payload.note)
  }

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    config.timeoutMs
  )

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: controller.signal,
    })

    const text = await response.text()
    if (!response.ok) {
      throw new Error(
        `Magyar Posta API error (${response.status} ${response.statusText})`
      )
    }

    const parsed = parseOrderResponse(text)
    if (parsed.parsed.type === "error") {
      throw new Error(
        `Magyar Posta API error${parsed.parsed.code ? ` ${parsed.parsed.code}` : ""}: ${parsed.parsed.message}`
      )
    }

    return {
      request: payload,
      response: parsed,
    }
  } finally {
    clearTimeout(timeout)
  }
}
