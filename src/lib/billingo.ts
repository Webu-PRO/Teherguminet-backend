import type { OrderDTO } from "@medusajs/types"

export type BillingoDocumentType = "receipt" | "invoice"

export const BILLINGO_METADATA_KEYS = {
  receipt: "billingo_receipt",
  invoice: "billingo_invoice",
} as const

export type BillingoDocumentMetadata = {
  id?: number
  invoice_number?: string
  public_url?: string
  created_at?: string
}

export type BillingoConfig = {
  apiKey: string
  baseUrl: string
  receiptBlockId: number
  invoiceBlockId?: number
  paymentMethodDefault: string
  electronic: boolean
  timeoutMs: number
  defaultDocumentType: BillingoDocumentType
  invoiceLanguage: string
  invoiceUnit: string
  invoiceUnitPriceType: "gross" | "net"
  invoiceBankAccountId?: number
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

type BillingoInvoiceItem = {
  name: string
  unit_price: number
  unit_price_type: "gross" | "net"
  quantity: number
  unit: string
  vat: string
  comment?: string
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

type BillingoInvoicePayload = {
  vendor_id?: string
  partner_id?: number
  name?: string
  emails?: string[]
  block_id: number
  type: "invoice"
  fulfillment_date: string
  due_date: string
  payment_method: string
  language: string
  currency: string
  conversion_rate?: number
  electronic?: boolean
  paid?: boolean
  bank_account_id?: number
  comment?: string
  settings?: Record<string, unknown>
  items: BillingoInvoiceItem[]
}

type BillingoDocumentPayload = BillingoReceiptPayload | BillingoInvoicePayload

const DEFAULT_BASE_URL = "https://api.billingo.hu/v3"
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_INVOICE_LANGUAGE = "hu"
const DEFAULT_INVOICE_UNIT = "db"
const DEFAULT_INVOICE_UNIT_PRICE_TYPE: BillingoConfig["invoiceUnitPriceType"] =
  "gross"

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

const normalizeNumericString = (raw: string) => {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  let normalized = trimmed.replace(/\s+/g, "")
  const hasComma = normalized.includes(",")
  const hasDot = normalized.includes(".")

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".")
    } else {
      normalized = normalized.replace(/,/g, "")
    }
  } else if (hasComma && !hasDot) {
    normalized = normalized.replace(",", ".")
  }

  normalized = normalized.replace(/[^0-9.-]/g, "")
  if (!normalized || normalized === "-" || normalized === ".") {
    return null
  }

  return normalized
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "string") {
    const normalized = normalizeNumericString(value)
    if (!normalized) {
      return null
    }
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (value && typeof value === "object") {
    const record = value as { value?: unknown }
    if ("value" in record) {
      return toNumber(record.value)
    }
  }
  return null
}

const readNumber = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = toNumber(value)
    if (typeof parsed === "number") {
      return parsed
    }
  }
  return null
}

const parsePositiveNumber = (value?: string | null) => {
  if (!value) {
    return null
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

const toDateString = (value?: string | Date | null) => {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : new Date()
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10)
  }
  return date.toISOString().slice(0, 10)
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

export const resolveBillingoDocumentType = (
  order: OrderDTO,
  config: BillingoConfig
): BillingoDocumentType => {
  const metadata = (order.metadata as Record<string, unknown> | null) ?? {}
  const direct =
    typeof metadata.billingo_document_type === "string"
      ? metadata.billingo_document_type.trim().toLowerCase()
      : ""
  if (direct === "invoice" || direct === "receipt") {
    return direct
  }
  return config.defaultDocumentType
}

export const hasBillingoMetadata = (
  metadata: Record<string, unknown> | null | undefined,
  type: BillingoDocumentType
) => {
  const record = metadata?.[BILLINGO_METADATA_KEYS[type]]
  if (!record || typeof record !== "object") {
    return false
  }
  const id = (record as BillingoDocumentMetadata).id
  return typeof id === "number" && Number.isFinite(id)
}

const resolveExtraPayload = (
  order: OrderDTO,
  type: BillingoDocumentType
) => {
  const metadata = (order.metadata as Record<string, unknown> | null) ?? {}
  const generic = metadata.billingo_payload
  const specific =
    type === "invoice"
      ? metadata.billingo_invoice_payload
      : metadata.billingo_receipt_payload

  const genericPayload =
    generic && typeof generic === "object" && !Array.isArray(generic)
      ? (generic as Record<string, unknown>)
      : null
  const specificPayload =
    specific && typeof specific === "object" && !Array.isArray(specific)
      ? (specific as Record<string, unknown>)
      : null

  if (!genericPayload && !specificPayload) {
    return null
  }

  return {
    ...(genericPayload ?? {}),
    ...(specificPayload ?? {}),
  }
}

export const getBillingoConfig = (): BillingoConfig | null => {
  const apiKey = process.env.BILLINGO_API_KEY?.trim()
  const receiptBlockIdRaw =
    process.env.BILLINGO_RECEIPT_BLOCK_ID?.trim() ??
    process.env.BILLINGO_BLOCK_ID?.trim()
  if (!apiKey || !receiptBlockIdRaw) {
    return null
  }

  const receiptBlockId = parsePositiveNumber(receiptBlockIdRaw)
  if (!receiptBlockId) {
    return null
  }

  const invoiceBlockId = parsePositiveNumber(
    process.env.BILLINGO_INVOICE_BLOCK_ID?.trim()
  )
  const defaultDocumentType =
    process.env.BILLINGO_DOCUMENT_TYPE?.trim().toLowerCase() === "invoice"
      ? "invoice"
      : "receipt"
  const paymentMethodDefault =
    process.env.BILLINGO_PAYMENT_METHOD?.trim() || "other"
  const electronic =
    (process.env.BILLINGO_ELECTRONIC ?? "")
      .toString()
      .trim()
      .toLowerCase() === "true"
  const invoiceLanguage =
    process.env.BILLINGO_INVOICE_LANGUAGE?.trim() || DEFAULT_INVOICE_LANGUAGE
  const invoiceUnit =
    process.env.BILLINGO_INVOICE_UNIT?.trim() || DEFAULT_INVOICE_UNIT
  const invoiceUnitPriceType =
    process.env.BILLINGO_INVOICE_UNIT_PRICE_TYPE?.trim().toLowerCase() === "net"
      ? "net"
      : DEFAULT_INVOICE_UNIT_PRICE_TYPE
  const invoiceBankAccountId = parsePositiveNumber(
    process.env.BILLINGO_INVOICE_BANK_ACCOUNT_ID?.trim()
  )
  const timeoutMsRaw = process.env.BILLINGO_TIMEOUT_MS?.trim()
  const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : DEFAULT_TIMEOUT_MS

  return {
    apiKey,
    baseUrl: process.env.BILLINGO_BASE_URL?.trim() || DEFAULT_BASE_URL,
    receiptBlockId,
    invoiceBlockId: invoiceBlockId ?? undefined,
    paymentMethodDefault,
    electronic,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS,
    defaultDocumentType,
    invoiceLanguage,
    invoiceUnit,
    invoiceUnitPriceType,
    invoiceBankAccountId: invoiceBankAccountId ?? undefined,
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
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }

    if (!response.ok) {
      const message =
        typeof (data as { error?: { message?: unknown } })?.error?.message ===
        "string"
          ? (data as { error?: { message?: string } }).error!.message!
          : typeof (data as { message?: unknown })?.message === "string"
            ? (data as { message?: string }).message!
            : response.statusText
      console.error("[Billingo] request failed", {
        status: response.status,
        statusText: response.statusText,
        data,
      })
      throw new Error(`Billingo ${response.status}: ${message}`)
    }

    return data as T
  } finally {
    clearTimeout(timeout)
  }
}

const applyPayloadOverrides = (
  payload: BillingoDocumentPayload,
  extra?: Record<string, unknown> | null
) => {
  if (!extra) {
    return payload
  }

  const merged: Record<string, unknown> = { ...payload }
  for (const [key, value] of Object.entries(extra)) {
    if (key === "type" || key === "block_id") {
      continue
    }
    if (key === "items") {
      if (Array.isArray(value)) {
        merged.items = value
      }
      continue
    }
    merged[key] = value
  }

  return merged as BillingoDocumentPayload
}

export const createBillingoDocument = async (
  order: OrderDTO,
  config: BillingoConfig,
  type?: BillingoDocumentType
) => {
  const currency = order.currency_code?.toUpperCase() || "EUR"
  const documentType = type ?? resolveBillingoDocumentType(order, config)
  const decimals = resolveDecimals(currency)
  const extraPayload = resolveExtraPayload(order, documentType)
  const paymentMethod = resolvePaymentMethod(
    order,
    config.paymentMethodDefault
  )

  if (documentType === "invoice" && !config.invoiceBlockId) {
    throw new Error("Billingo: invoice block id is missing")
  }

  const shippingMethod = order.shipping_methods?.[0]
  const shippingTotal = toNumber(order.shipping_total) ?? 0

  let baseItems = (order.items ?? [])
    .map((item) => {
      if (!item) {
        return null
      }

      const record = item as unknown as Record<string, unknown>
      const detail =
        (record.detail as Record<string, unknown> | null) ?? null
      const quantityValue =
        readNumber(
          record.quantity,
          record.raw_quantity,
          detail?.quantity,
          detail?.raw_quantity
        ) ?? 0
      if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
        return null
      }

      const quantity = Math.max(quantityValue, 1)
      const unitPrice =
        readNumber(record.unit_price, record.raw_unit_price) ?? 0
      const lineTotal =
        readNumber(
          record.total,
          record.item_total,
          record.subtotal,
          record.raw_total,
          record.raw_item_total,
          record.raw_subtotal
        ) ??
        unitPrice * quantity

      return {
        title: item.title ?? "Item",
        quantity,
        lineTotal,
        vat: resolveItemVat(item.tax_lines ?? null),
      }
    })
    .filter(
      (
        item
      ): item is {
        title: string
        quantity: number
        lineTotal: number
        vat: string
      } => Boolean(item)
    )

  if (!baseItems.length) {
    const orderRecord = order as unknown as Record<string, unknown>
    const orderTotal =
      readNumber(
        orderRecord.total,
        orderRecord.subtotal,
        orderRecord.item_total,
        orderRecord.raw_total,
        orderRecord.raw_subtotal,
        orderRecord.raw_item_total
      ) ?? 0
    if (orderTotal > 0) {
      const fallbackTotal =
        shippingTotal > 0
          ? Math.max(orderTotal - shippingTotal, 0)
          : orderTotal
      if (fallbackTotal > 0) {
        baseItems = [
          {
            title: "Order total",
            quantity: 1,
            lineTotal: fallbackTotal,
            vat: resolveItemVat(shippingMethod?.tax_lines ?? null),
          },
        ]
      }
    }
  }

  if (documentType === "receipt") {
    const items: BillingoReceiptItem[] = baseItems
      .map((item) => {
        const unitPrice = roundTo(
          toMajor(item.lineTotal, currency),
          decimals
        )
        const name =
          item.quantity > 1
            ? `${item.title} x${item.quantity}`
            : item.title
        return {
          name,
          unit_price: unitPrice,
          vat: item.vat,
        }
      })
      .filter((item) => item.unit_price > 0)

    if (shippingTotal > 0) {
      items.push({
        name: "Shipping",
        unit_price: roundTo(toMajor(shippingTotal, currency), decimals),
        vat: resolveItemVat(shippingMethod?.tax_lines ?? null),
      })
    }

    if (!items.length) {
      throw new Error("Billingo: no receipt items available")
    }

    const basePayload: BillingoReceiptPayload = {
      vendor_id: order.id,
      name: resolveCustomerName(order),
      emails: order.email ? [order.email] : undefined,
      block_id: config.receiptBlockId,
      type: "receipt",
      payment_method: paymentMethod,
      currency,
      electronic: config.electronic,
      items,
    }

    const payload = applyPayloadOverrides(basePayload, extraPayload)

    return billingoRequest<BillingoDocument>(
      config,
      "/documents/receipt",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    )
  }

  const items: BillingoInvoiceItem[] = baseItems
    .map((item) => {
      const unitPrice = roundTo(
        toMajor(item.lineTotal / item.quantity, currency),
        decimals
      )
      return {
        name: item.title,
        unit_price: unitPrice,
        unit_price_type: config.invoiceUnitPriceType,
        quantity: item.quantity,
        unit: config.invoiceUnit,
        vat: item.vat,
      }
    })
    .filter((item) => item.unit_price > 0)

  if (shippingTotal > 0) {
    items.push({
      name: "Shipping",
      unit_price: roundTo(toMajor(shippingTotal, currency), decimals),
      unit_price_type: config.invoiceUnitPriceType,
      quantity: 1,
      unit: config.invoiceUnit,
      vat: resolveItemVat(shippingMethod?.tax_lines ?? null),
    })
  }

  if (!items.length) {
    throw new Error("Billingo: no invoice items available")
  }

  const documentDate = toDateString(
    (order as OrderDTO & { created_at?: string | Date }).created_at
  )

  const basePayload: BillingoInvoicePayload = {
    vendor_id: order.id,
    name: resolveCustomerName(order),
    emails: order.email ? [order.email] : undefined,
    block_id: config.invoiceBlockId!,
    type: "invoice",
    fulfillment_date: documentDate,
    due_date: documentDate,
    payment_method: paymentMethod,
    language: config.invoiceLanguage,
    currency,
    electronic: config.electronic,
    items,
  }

  if (config.invoiceBankAccountId) {
    basePayload.bank_account_id = config.invoiceBankAccountId
  }

  const payload = applyPayloadOverrides(basePayload, extraPayload)

  return billingoRequest<BillingoDocument>(config, "/documents", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export const createBillingoReceipt = async (
  order: OrderDTO,
  config: BillingoConfig
) => createBillingoDocument(order, config, "receipt")

export const createBillingoInvoice = async (
  order: OrderDTO,
  config: BillingoConfig
) => createBillingoDocument(order, config, "invoice")

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

export const getBillingoDocumentPdf = async (
  documentId: number,
  config: BillingoConfig
) => {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    config.timeoutMs
  )

  try {
    const response = await fetch(
      `${config.baseUrl}/documents/${documentId}/download`,
      {
        method: "GET",
        headers: {
          Accept: "application/pdf",
          "X-API-KEY": config.apiKey,
        },
        signal: controller.signal,
      }
    )

    if (!response.ok) {
      let message = response.statusText
      try {
        const text = await response.text()
        if (text) {
          const data = JSON.parse(text)
          if (typeof data?.error?.message === "string") {
            message = data.error.message
          }
        }
      } catch {
        // ignore parse errors
      }

      throw new Error(`Billingo ${response.status}: ${message}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer.toString("base64")
  } finally {
    clearTimeout(timeout)
  }
}
