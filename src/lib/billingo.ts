import type { OrderDTO } from "@medusajs/types"

type BillingoConfig = {
  apiKey: string
  baseUrl: string
  blockId: number
  paymentMethodDefault: string
  electronic: boolean
  timeoutMs: number
}

type BillingoDocument = {
  id: number
  invoice_number?: string
}

type BillingoPublicUrl = {
  public_url?: string
}

type BillingoReceiptItem = {
  name: string
  unit_price: number
  vat: string
}

type BillingoReceiptPayload = {
  vendor_id?: string
  partner_id?: number
  name?: string
  emails?: string[]
  block_id: number
  type: "receipt"
  payment_method: string
  currency: string
  conversion_rate?: number
  electronic?: boolean
  items: BillingoReceiptItem[]
}

const DEFAULT_BASE_URL = "https://api.billingo.hu/v3"
const DEFAULT_TIMEOUT_MS = 15_000

const resolveDecimals = (currency: string): number => {
  try {
    const decimals = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits
    if (typeof decimals === "number" && Number.isFinite(decimals)) {
      return decimals
    }
    return 2
  } catch {
    return 2
  }
}

const roundTo = (value: number, decimals: number) => {
  const factor = Math.pow(10, decimals)
  if (!Number.isFinite(factor) || factor === 0) {
    return value
  }
  return Math.round(value * factor) / factor
}

const toMajor = (amount: number, currency: string) => {
  const decimals = resolveDecimals(currency)
  const divisor = Math.pow(10, decimals)
  return divisor ? amount / divisor : amount
}

const normalizeVatRate = (rate?: number | null) => {
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    return 0
  }
  if (rate <= 1) {
    return rate * 100
  }
  return rate
}

const formatVat = (rate: number) => {
  if (!Number.isFinite(rate) || rate <= 0) {
    return "0%"
  }
  const rounded = Math.round(rate * 10) / 10
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 0.01
  if (isWhole) {
    return `${Math.round(rounded)}%`
  }
  return `${rounded.toString().replace(".", ",")}%`
}

type TaxLine = { rate?: number | null }

const resolveItemVat = (taxLines?: TaxLine[] | null) => {
  if (!Array.isArray(taxLines) || taxLines.length === 0) {
    return "0%"
  }
  const rates = taxLines
    .map((line) => normalizeVatRate(line?.rate ?? null))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (!rates.length) {
    return "0%"
  }
  return formatVat(Math.max(...rates))
}

const toNumber = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const resolveCustomerName = (order: OrderDTO) => {
  const billing = order.billing_address
  const shipping = order.shipping_address
  const company =
    (billing?.company ?? shipping?.company ?? "").trim()
  if (company) {
    return company
  }
  const first =
    (billing?.first_name ?? shipping?.first_name ?? "").trim()
  const last =
    (billing?.last_name ?? shipping?.last_name ?? "").trim()
  const full = `${first} ${last}`.trim()
  return full || "Customer"
}

const resolvePaymentMethod = (
  order: OrderDTO,
  fallback: string
) => {
  const metadata = (order.metadata as Record<string, unknown> | null) ?? {}
  const direct =
    typeof metadata.payment_method === "string"
      ? metadata.payment_method.trim()
      : ""
  if (direct) {
    return direct
  }

  const provider = [
    metadata.payment_provider,
    metadata.payment_provider_id,
    metadata.payment_method_id,
  ]
    .map((value) => (typeof value === "string" ? value : ""))
    .join(" ")
    .toLowerCase()

  if (provider.includes("stripe") || provider.includes("bankcard")) {
    return "bankcard"
  }
  if (
    provider.includes("manual") ||
    provider.includes("wire") ||
    provider.includes("bank")
  ) {
    return "wire_transfer"
  }
  if (provider.includes("cod") || provider.includes("cash_on_delivery")) {
    return "cash_on_delivery"
  }

  return fallback
}

export const getBillingoConfig = (): BillingoConfig | null => {
  const apiKey = process.env.BILLINGO_API_KEY?.trim()
  const blockIdRaw = process.env.BILLINGO_BLOCK_ID?.trim()
  if (!apiKey || !blockIdRaw) {
    return null
  }

  const blockId = Number(blockIdRaw)
  if (!Number.isFinite(blockId) || blockId <= 0) {
    return null
  }

  const paymentMethodDefault =
    process.env.BILLINGO_PAYMENT_METHOD?.trim() || "other"
  const electronic =
    (process.env.BILLINGO_ELECTRONIC ?? "")
      .toString()
      .trim()
      .toLowerCase() === "true"
  const timeoutMsRaw = process.env.BILLINGO_TIMEOUT_MS?.trim()
  const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : DEFAULT_TIMEOUT_MS

  return {
    apiKey,
    baseUrl: process.env.BILLINGO_BASE_URL?.trim() || DEFAULT_BASE_URL,
    blockId,
    paymentMethodDefault,
    electronic,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS,
  }
}

const billingoRequest = async <T>(
  config: BillingoConfig,
  path: string,
  options: RequestInit
): Promise<T> => {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    config.timeoutMs
  )

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-KEY": config.apiKey,
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    })

    const text = await response.text()
    const data = text ? JSON.parse(text) : null

    if (!response.ok) {
      const message =
        typeof data?.error?.message === "string"
          ? data.error.message
          : response.statusText
      throw new Error(`Billingo ${response.status}: ${message}`)
    }

    return data as T
  } finally {
    clearTimeout(timeout)
  }
}

export const createBillingoReceipt = async (
  order: OrderDTO,
  config: BillingoConfig
) => {
  const currency = order.currency_code?.toUpperCase() || "EUR"

  const items: BillingoReceiptItem[] = (order.items ?? [])
    .filter((item) => item && typeof item.quantity === "number")
    .map((item) => {
      const quantity = Math.max(item.quantity ?? 1, 1)
      const lineTotal =
        toNumber(item.total) ??
        toNumber(item.item_total) ??
        toNumber(item.subtotal) ??
        (toNumber(item.unit_price) ?? 0) * quantity

      const decimals = resolveDecimals(currency)
      const unitPrice = roundTo(toMajor(lineTotal, currency), decimals)
      const name = `${item.title ?? "Item"}${quantity > 1 ? ` x${quantity}` : ""}`
      return {
        name,
        unit_price: unitPrice,
        vat: resolveItemVat(item.tax_lines ?? null),
      }
    })
    .filter((item) => item.unit_price > 0)

  const shippingTotal = toNumber(order.shipping_total) ?? 0
  if (shippingTotal > 0) {
    const decimals = resolveDecimals(currency)
    const shippingMethod = order.shipping_methods?.[0]
    items.push({
      name: "Shipping",
      unit_price: roundTo(toMajor(shippingTotal, currency), decimals),
      vat: resolveItemVat(shippingMethod?.tax_lines ?? null),
    })
  }

  if (!items.length) {
    throw new Error("Billingo: no receipt items available")
  }

  const payload: BillingoReceiptPayload = {
    vendor_id: order.id,
    name: resolveCustomerName(order),
    emails: order.email ? [order.email] : undefined,
    block_id: config.blockId,
    type: "receipt",
    payment_method: resolvePaymentMethod(
      order,
      config.paymentMethodDefault
    ),
    currency,
    electronic: config.electronic,
    items,
  }

  const document = await billingoRequest<BillingoDocument>(
    config,
    "/documents/receipt",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  )

  return document
}

export const getBillingoPublicUrl = async (
  documentId: number,
  config: BillingoConfig
) => {
  return billingoRequest<BillingoPublicUrl>(
    config,
    `/documents/${documentId}/public-url`,
    {
      method: "GET",
    }
  )
}
