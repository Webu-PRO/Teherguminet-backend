import type { OrderDTO } from "@medusajs/types"

export type BillingoDocumentType = "receipt" | "invoice"

export const BILLINGO_METADATA_KEYS = {
  receipt: "billingo_receipt",
  invoice: "billingo_invoice",
} as const

export const BILLINGO_STATUS_KEYS = {
  receipt: "billingo_receipt_status",
  invoice: "billingo_invoice_status",
} as const

export const BILLINGO_ERROR_KEYS = {
  receipt: "billingo_receipt_error",
  invoice: "billingo_invoice_error",
} as const

export type BillingoDocumentStatus = "pending" | "success" | "failed"

export type BillingoDocumentError = {
  message: string
  at: string
}

export type BillingoDocumentMetadata = {
  id?: number
  invoice_number?: string
  public_url?: string
  created_at?: string
}

export type BillingoConfig = {
  apiKey: string
  baseUrl: string
  invoiceBlockId: number
  paymentMethodDefault: string
  electronic: boolean
  timeoutMs: number
  defaultDocumentType: BillingoDocumentType
  invoiceLanguage: string
  invoiceUnit: string
  invoiceUnitPriceType: "gross" | "net"
  invoiceOrderUnitPriceAsNet?: boolean
  invoiceBankAccountId?: number
}

type BillingoDocument = {
  id: number
  invoice_number?: string
}

type BillingoPublicUrl = {
  public_url?: string
}

type BillingoBankAccount = {
  id?: number
}

type BillingoBankAccountListResponse = {
  data?: BillingoBankAccount[]
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
  discount?: {
    type: "percent"
    value: number
  }
  items: BillingoInvoiceItem[]
}

type BillingoDocumentPayload = BillingoReceiptPayload | BillingoInvoicePayload

type BillingoPartnerAddress = {
  country_code: string
  post_code: string
  city: string
  address: string
}

type BillingoPartnerPayload = {
  name: string
  address: BillingoPartnerAddress
  emails?: string[]
  taxcode?: string
  phone?: string
}

type BillingoPartner = {
  id: number
}

const DEFAULT_BASE_URL = "https://api.billingo.hu/v3"
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_INVOICE_LANGUAGE = "hu"
const DEFAULT_INVOICE_UNIT = "db"
const DEFAULT_INVOICE_UNIT_PRICE_TYPE: BillingoConfig["invoiceUnitPriceType"] =
  "gross"
const DEFAULT_CURRENCY_DECIMALS: Record<string, number> = {
  HUF: 0,
}

const parseCurrencyDecimals = (value?: string | null) => {
  const overrides: Record<string, number> = { ...DEFAULT_CURRENCY_DECIMALS }
  if (!value) {
    return overrides
  }

  for (const entry of value.split(",")) {
    const trimmed = entry.trim()
    if (!trimmed) {
      continue
    }
    const [currencyRaw, decimalsRaw] = trimmed.split(":")
    if (!currencyRaw || !decimalsRaw) {
      continue
    }
    const currency = currencyRaw.trim().toUpperCase()
    const parsed = Number(decimalsRaw.trim())
    if (!currency || !Number.isFinite(parsed) || parsed < 0) {
      continue
    }
    overrides[currency] = Math.floor(parsed)
  }

  return overrides
}

const CURRENCY_DECIMALS = parseCurrencyDecimals(
  process.env.BILLINGO_CURRENCY_DECIMALS
)

const readBooleanFlag = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase()
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  )
}

export const isBillingoDebugEnabled = () => {
  return readBooleanFlag(process.env.BILLINGO_DEBUG)
}

export class BillingoRequestError extends Error {
  status: number
  statusText: string
  path: string
  method: string
  requestBody: unknown
  responseData: unknown

  constructor(input: {
    status: number
    statusText: string
    message: string
    path: string
    method: string
    requestBody: unknown
    responseData: unknown
  }) {
    super(`Billingo ${input.status}: ${input.message}`)
    this.name = "BillingoRequestError"
    this.status = input.status
    this.statusText = input.statusText
    this.path = input.path
    this.method = input.method
    this.requestBody = input.requestBody
    this.responseData = input.responseData
  }
}

const parseBodyForLog = (body: RequestInit["body"]) => {
  if (typeof body !== "string") {
    return null
  }

  try {
    return JSON.parse(body) as Record<string, unknown>
  } catch {
    return body.length > 2000 ? `${body.slice(0, 2000)}…` : body
  }
}

const resolveConfiguredConversionRate = (currency: string) => {
  const normalized = currency.toUpperCase()
  const byCurrency = process.env[`BILLINGO_CONVERSION_RATE_${normalized}`]
  const generic = process.env.BILLINGO_CONVERSION_RATE
  const parsed = readNumber(byCurrency, generic)
  if (!parsed || parsed <= 0) {
    return undefined
  }
  return parsed
}

const resolveConversionRateFromApi = async (
  config: BillingoConfig,
  fromCurrency: string,
  documentDate: string
) => {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    config.timeoutMs
  )

  const query = new URLSearchParams({
    from: fromCurrency,
    to: "HUF",
    date: documentDate,
  })

  try {
    const response = await fetch(
      `${config.baseUrl}/currencies?${query.toString()}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-API-KEY": config.apiKey,
        },
        signal: controller.signal,
      }
    )

    if (!response.ok) {
      console.warn("[Billingo] failed to fetch conversion_rate", {
        fromCurrency,
        status: response.status,
        statusText: response.statusText,
      })
      return null
    }

    const text = await response.text()
    if (!text) {
      return null
    }

    let data: unknown = null
    try {
      data = JSON.parse(text)
    } catch {
      return null
    }

    const payload =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null

    const parsedRate = readNumber(
      payload?.conversion_rate,
      payload?.conversation_rate,
      payload?.rate
    )
    if (!parsedRate || parsedRate <= 0) {
      return null
    }

    return parsedRate
  } catch (error) {
    console.warn("[Billingo] conversion_rate request failed", {
      fromCurrency,
      message:
        error instanceof Error ? error.message : "Unknown error",
    })
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const resolveConversionRate = async ({
  config,
  currency,
  documentType,
  documentDate,
  extraPayload,
}: {
  config: BillingoConfig
  currency: string
  documentType: BillingoDocumentType
  documentDate: string
  extraPayload?: Record<string, unknown> | null
}) => {
  const normalizedCurrency = currency.toUpperCase()
  if (normalizedCurrency === "HUF") {
    return undefined
  }

  const payloadRate = readNumber(
    extraPayload?.conversion_rate,
    extraPayload?.conversation_rate,
    extraPayload?.rate
  )
  if (payloadRate && payloadRate > 0) {
    return payloadRate
  }

  const apiRate = await resolveConversionRateFromApi(
    config,
    normalizedCurrency,
    documentDate
  )
  if (apiRate && apiRate > 0) {
    return apiRate
  }

  const configuredRate = resolveConfiguredConversionRate(
    normalizedCurrency
  )
  if (configuredRate) {
    return configuredRate
  }

  if (documentType === "invoice") {
    throw new Error(
      `Billingo: missing conversion_rate for non-HUF invoice (${normalizedCurrency})`
    )
  }

  console.warn(
    "[Billingo] missing conversion_rate for non-HUF document, defaulting to 1",
    {
      currency: normalizedCurrency,
      documentType,
    }
  )
  return 1
}

const summarizePayloadForLog = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload
  }

  const record = payload as Record<string, unknown>
  const items = Array.isArray(record.items) ? record.items : null

  return {
    ...record,
    ...(items
      ? {
          items_count: items.length,
          items_preview: items.slice(0, 3),
          items: undefined,
        }
      : {}),
  }
}

const resolveDecimals = (currency: string): number => {
  const normalized = currency.toUpperCase()
  const override = CURRENCY_DECIMALS[normalized]
  if (typeof override === "number" && Number.isFinite(override)) {
    return override
  }

  try {
    const decimals = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalized,
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

type BillingoAmountMode = "major" | "minor"

const toMajor = (amount: number, currency: string) => {
  const decimals = resolveDecimals(currency)
  const divisor = Math.pow(10, decimals)
  return divisor ? amount / divisor : amount
}

const normalizeAmountForBillingo = ({
  amount,
  currency,
  mode,
}: {
  amount: number
  currency: string
  mode: BillingoAmountMode
}) => {
  if (mode === "minor") {
    return toMajor(amount, currency)
  }

  return amount
}

const hasFractionalComponent = (value: number) => {
  return Math.abs(value - Math.round(value)) > 0.000001
}

const inferAmountModeFromOrder = ({
  currency,
  values,
}: {
  currency: string
  values: Array<number | null | undefined>
}): BillingoAmountMode => {
  if (resolveDecimals(currency) === 0) {
    return "major"
  }

  const finite = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value)
  )
  if (!finite.length) {
    return "major"
  }

  if (finite.some((value) => hasFractionalComponent(value))) {
    return "major"
  }

  const maxAbs = finite.reduce(
    (max, value) => Math.max(max, Math.abs(value)),
    0
  )

  // Legacy guard: if all observed values are whole numbers and very large for
  // a decimal currency, treat them as minor units.
  return maxAbs >= 20_000 ? "minor" : "major"
}

const shouldSwitchAmountModeForMismatch = ({
  mode,
  targetTotal,
  estimatedTotal,
}: {
  mode: BillingoAmountMode
  targetTotal: number | null
  estimatedTotal: number
}) => {
  if (
    mode !== "minor" ||
    typeof targetTotal !== "number" ||
    !Number.isFinite(targetTotal) ||
    targetTotal <= 0 ||
    targetTotal > 1000 ||
    !Number.isFinite(estimatedTotal) ||
    estimatedTotal <= 0
  ) {
    return false
  }

  const ratio = targetTotal / estimatedTotal
  return ratio >= 95 && ratio <= 105
}

const DEFAULT_VAT_RATES = [0, 5, 18, 27]

const parseVatRates = (value?: string | null) => {
  if (!value) {
    return DEFAULT_VAT_RATES
  }
  const rates = value
    .split(",")
    .map((entry) => toNumber(entry))
    .filter((rate): rate is number => typeof rate === "number")
    .map((rate) => (rate <= 1 ? rate * 100 : rate))
    .filter((rate) => Number.isFinite(rate) && rate >= 0)

  return rates.length ? rates : DEFAULT_VAT_RATES
}

const BILLINGO_VAT_RATES = parseVatRates(
  process.env.BILLINGO_VAT_RATES
)

const normalizeVatRate = (rate?: unknown) => {
  const parsed = toNumber(rate)
  if (parsed === null) {
    return 0
  }
  if (parsed <= 1) {
    return parsed * 100
  }
  return parsed
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

const normalizeBillingoVat = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) {
    return "0%"
  }
  const upper = trimmed.toUpperCase()
  if (/[A-Z]/.test(upper) && !/[0-9]/.test(upper)) {
    return upper
  }

  const parsed = toNumber(trimmed)
  if (parsed === null) {
    return trimmed
  }
  const rate = parsed <= 1 ? parsed * 100 : parsed
  if (BILLINGO_VAT_RATES.length) {
    let closest = BILLINGO_VAT_RATES[0]
    let minDiff = Math.abs(rate - closest)
    for (const candidate of BILLINGO_VAT_RATES) {
      const diff = Math.abs(rate - candidate)
      if (diff < minDiff) {
        minDiff = diff
        closest = candidate
      }
    }
    if (minDiff <= 2 || (closest === 0 && rate === 0)) {
      return `${closest}%`
    }
    return formatVat(rate)
  }
  return formatVat(rate)
}

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
  return normalizeBillingoVat(formatVat(Math.max(...rates)))
}

const resolveVatFromTotals = (
  total: number,
  taxTotal: number | null
) => {
  if (!taxTotal || !Number.isFinite(taxTotal)) {
    return null
  }
  if (taxTotal <= 0 || total <= taxTotal) {
    return null
  }
  const rate = (taxTotal / (total - taxTotal)) * 100
  return normalizeBillingoVat(formatVat(rate))
}

const resolveVatRateFromTotals = (
  total: number,
  taxTotal: number | null
) => {
  if (!taxTotal || !Number.isFinite(taxTotal)) {
    return null
  }
  if (taxTotal <= 0 || total <= taxTotal) {
    return null
  }
  return (taxTotal / (total - taxTotal)) * 100
}

const parseVatPercent = (vat: string) => {
  const normalized = vat.trim().replace("%", "").replace(",", ".")
  if (!normalized) {
    return null
  }
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }
  return parsed
}

const resolveInvoiceUnitPrice = ({
  lineTotal,
  quantity,
  currency,
  vat,
  unitPriceType,
  amountMode,
}: {
  lineTotal: number
  quantity: number
  currency: string
  vat: string
  unitPriceType: BillingoConfig["invoiceUnitPriceType"]
  amountMode: BillingoAmountMode
}) => {
  const grossUnitPrice = normalizeAmountForBillingo({
    amount: lineTotal / quantity,
    currency,
    mode: amountMode,
  })
  const currencyDecimals = resolveDecimals(currency)
  const vatPercent = parseVatPercent(vat)

  if (unitPriceType === "net") {
    if (vatPercent !== null) {
      const divider = 1 + vatPercent / 100
      if (divider > 0) {
        return roundTo(grossUnitPrice / divider, currencyDecimals)
      }
    }
    return roundTo(grossUnitPrice, currencyDecimals)
  }

  // For HUF + gross pricing, Billingo can render long net unit-price decimals.
  // Sending a 2-decimal gross unit price derived from an integer net value keeps
  // the printed net unit price clean in the PDF.
  if (currency.toUpperCase() === "HUF" && vatPercent !== null && vatPercent > 0) {
    const netRounded = Math.round(grossUnitPrice / (1 + vatPercent / 100))
    return roundTo(netRounded * (1 + vatPercent / 100), 2)
  }

  return roundTo(grossUnitPrice, currencyDecimals)
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

const readString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value !== "string") {
      continue
    }
    const trimmed = value.trim()
    if (trimmed) {
      return trimmed
    }
  }
  return ""
}

const readBoolean = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase()
      if (["1", "true", "yes", "on"].includes(normalized)) {
        return true
      }
      if (["0", "false", "no", "off"].includes(normalized)) {
        return false
      }
    }
  }
  return null
}

const SHIPPING_TITLE_PATTERN = /\bshipping\b|\bdelivery\b|szállítás/i
const TIRE_SIZE_PATTERN =
  /\b(?:\d{3}\/\d{2}(?:\.\d+)?\s*R\d{2}(?:\.\d+)?(?:-\d{1,3})?|\d{2}\s*R\d{2}(?:\.\d+)?(?:-\d{1,3})?)\b/i
const KNOWN_TIRE_BRANDS = [
  "HUBTRAC",
  "AEROTYRE",
  "SUPERWAY",
  "GROUNDSPEED",
] as const
const BRAND_METADATA_KEYS = [
  "brand",
  "márka",
  "marka",
  "manufacturer",
  "gyártó",
  "gyarto",
] as const

const compactSpaces = (value: string) =>
  value.replace(/\s+/g, " ").trim()

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

const findKnownBrandInText = (text: string) =>
  KNOWN_TIRE_BRANDS.find((brand) =>
    new RegExp(`\\b${brand}\\b`, "i").test(text)
  ) ?? ""

const readMetadataString = (
  metadata: Record<string, unknown> | null | undefined,
  keys: readonly string[]
) => {
  if (!metadata) {
    return ""
  }

  const normalizedKeys = keys.map((key) => key.toLowerCase())
  for (const [metadataKey, metadataValue] of Object.entries(metadata)) {
    if (!normalizedKeys.includes(metadataKey.toLowerCase())) {
      continue
    }

    const value = readString(metadataValue)
    if (value) {
      return value
    }
  }

  return ""
}

const resolveKnownBrand = (
  record: Record<string, unknown>,
  detail: Record<string, unknown> | null,
  baseTitle: string
) => {
  const fromTitle = findKnownBrandInText(baseTitle)
  if (fromTitle) {
    return fromTitle
  }

  const recordMetadata = asRecord(record.metadata)
  const detailMetadata = asRecord(detail?.metadata)
  const recordVariant = asRecord(record.variant) ?? asRecord(detail?.variant)
  const recordProduct =
    asRecord(record.product) ??
    asRecord(detail?.product) ??
    asRecord(recordVariant?.product)
  const variantMetadata = asRecord(recordVariant?.metadata)
  const productMetadata = asRecord(recordProduct?.metadata)
  const metadataBrand =
    readString(
      readMetadataString(recordMetadata, BRAND_METADATA_KEYS),
      readMetadataString(detailMetadata, BRAND_METADATA_KEYS),
      readMetadataString(variantMetadata, BRAND_METADATA_KEYS),
      readMetadataString(productMetadata, BRAND_METADATA_KEYS),
      record.brand,
      detail?.brand,
      recordVariant?.brand,
      recordProduct?.brand
    ) || ""

  if (metadataBrand) {
    const normalized = metadataBrand.toUpperCase()
    const known =
      KNOWN_TIRE_BRANDS.find((brand) => brand === normalized) ?? ""
    if (known) {
      return known
    }
    const knownFromMetadata = findKnownBrandInText(metadataBrand)
    if (knownFromMetadata) {
      return knownFromMetadata
    }
  }

  const productTagText = Array.isArray(recordProduct?.tags)
    ? (recordProduct?.tags as unknown[])
        .map((tag) => {
          const tagRecord = asRecord(tag)
          return readString(tagRecord?.value, tagRecord?.name)
        })
        .filter(Boolean)
        .join(" ")
    : ""

  const fromSkuOrVariant = findKnownBrandInText(
    [
      readString(record.variant_sku, detail?.variant_sku),
      readString(record.sku, detail?.sku),
      readString(record.variant_title, detail?.variant_title),
      readString(record.product_title, detail?.product_title),
      readString(recordVariant?.title),
      readString(recordProduct?.title, recordProduct?.handle),
      productTagText,
      metadataBrand,
    ]
      .filter(Boolean)
      .join(" ")
  )

  if (fromSkuOrVariant) {
    return fromSkuOrVariant
  }

  return metadataBrand ? metadataBrand.toUpperCase() : ""
}

const resolveBillingoItemTitle = (
  record: Record<string, unknown>,
  detail: Record<string, unknown> | null
) => {
  const baseTitle = readString(
    record.product_title,
    detail?.product_title,
    record.title,
    detail?.title,
    record.variant_title,
    detail?.variant_title,
    record.sku,
    detail?.sku
  )
  if (!baseTitle) {
    return "Item"
  }

  const normalizedTitle = compactSpaces(baseTitle)

  if (SHIPPING_TITLE_PATTERN.test(normalizedTitle)) {
    return "Szállítási költség"
  }

  const sizeMatch = normalizedTitle.match(TIRE_SIZE_PATTERN)
  const hasTirePrefix = /^gumiabroncs\b/i.test(normalizedTitle)

  if (!sizeMatch && !hasTirePrefix) {
    return normalizedTitle
  }

  const detectedBrand = resolveKnownBrand(record, detail, normalizedTitle)
  const withoutPrefix = compactSpaces(
    normalizedTitle.replace(/^gumiabroncs\b/i, "")
  )
  const hasBrandAlready = detectedBrand
    ? new RegExp(`\\b${escapeRegExp(detectedBrand)}\\b`, "i").test(
        withoutPrefix
      )
    : false
  const withBrand =
    detectedBrand && !hasBrandAlready
      ? compactSpaces(`${withoutPrefix} ${detectedBrand}`)
      : withoutPrefix

  return compactSpaces(`GUMIABRONCS ${withBrand}`)
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
  const normalizeToken = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")

  const normalizePaymentMethod = (value?: string | null) => {
    if (typeof value !== "string") {
      return null
    }

    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    const normalized = normalizeToken(trimmed).replace(/[\s-]+/g, "_")

    if (normalized === "other" || normalized === "egyeb") {
      return null
    }
    if (
      normalized.includes("wire_transfer") ||
      normalized.includes("bank_transfer") ||
      normalized.includes("atutalas") ||
      normalized.includes("utalas")
    ) {
      return "wire_transfer"
    }
    if (
      normalized.includes("bankcard") ||
      normalized.includes("bankkartya") ||
      normalized.includes("kartya") ||
      normalized.includes("card")
    ) {
      return "bankcard"
    }
    if (
      normalized.includes("cash_on_delivery") ||
      normalized.includes("utanvet") ||
      normalized === "cod"
    ) {
      return "cash_on_delivery"
    }

    return trimmed
  }

  const metadata = (order.metadata as Record<string, unknown> | null) ?? {}
  const direct = normalizePaymentMethod(
    typeof metadata.payment_method === "string"
      ? metadata.payment_method
      : null
  )
  if (direct) {
    return direct
  }

  const provider = normalizeToken(
    [
      metadata.payment_provider,
      metadata.payment_provider_id,
      metadata.payment_method_id,
    ]
      .map((value) => (typeof value === "string" ? value : ""))
      .join(" ")
  )

  if (
    provider.includes("stripe") ||
    provider.includes("bankcard") ||
    provider.includes("simplepay") ||
    provider.includes("barion") ||
    provider.includes("kartya") ||
    provider.includes("card")
  ) {
    return "bankcard"
  }
  if (
    provider.includes("manual") ||
    provider.includes("wire") ||
    provider.includes("bank") ||
    provider.includes("transfer") ||
    provider.includes("atutalas") ||
    provider.includes("utalas")
  ) {
    return "wire_transfer"
  }
  if (
    provider.includes("cod") ||
    provider.includes("cash_on_delivery") ||
    provider.includes("utanvet")
  ) {
    return "cash_on_delivery"
  }

  return normalizePaymentMethod(fallback) ?? "wire_transfer"
}

const resolveVendorId = (
  order: OrderDTO,
  type: BillingoDocumentType
) => {
  const id = typeof order.id === "string" ? order.id.trim() : ""
  if (!id) {
    return undefined
  }
  return `${id}-${type}`
}

const resolveMetadataRecord = (
  value: unknown
): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

const resolvePartnerIdFromPayload = (payload: unknown) => {
  const record = resolveMetadataRecord(payload)
  if (!record) {
    return null
  }
  const parsed = readNumber(record.partner_id)
  if (!parsed || parsed <= 0) {
    return null
  }
  return parsed
}

export const resolveBillingoPartnerId = (
  metadata?: Record<string, unknown> | null
) => {
  if (!metadata) {
    return null
  }
  const direct = readNumber(metadata.billingo_partner_id)
  if (direct && direct > 0) {
    return direct
  }
  return (
    resolvePartnerIdFromPayload(metadata.billingo_payload) ??
    resolvePartnerIdFromPayload(metadata.billingo_invoice_payload) ??
    resolvePartnerIdFromPayload(metadata.billingo_receipt_payload)
  )
}

const resolvePartnerTaxcode = (order: OrderDTO) => {
  const metadata =
    (order.metadata as Record<string, unknown> | null) ?? {}
  const candidates: Array<unknown> = [
    metadata.billingo_taxcode,
    metadata.taxcode,
    metadata.tax_code,
    metadata.vat_number,
    metadata.vat,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }
  return null
}

const resolvePartnerPayload = (
  order: OrderDTO
): BillingoPartnerPayload | null => {
  const billing = resolveMetadataRecord(order.billing_address)
  const shipping = resolveMetadataRecord(order.shipping_address)
  const address = billing ?? shipping
  if (!address) {
    return null
  }

  const company =
    (typeof address.company === "string" ? address.company : "")?.trim() ?? ""
  const first =
    (typeof address.first_name === "string"
      ? address.first_name
      : ""
    )?.trim() ?? ""
  const last =
    (typeof address.last_name === "string"
      ? address.last_name
      : ""
    )?.trim() ?? ""
  const fullName = `${first} ${last}`.trim()
  const name = company || fullName || "Customer"

  const addressLine = [
    typeof address.address_1 === "string" ? address.address_1 : "",
    typeof address.address_2 === "string" ? address.address_2 : "",
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ")
  const city =
    typeof address.city === "string" ? address.city.trim() : ""
  const postCode =
    typeof address.postal_code === "string"
      ? address.postal_code.trim()
      : ""
  const countryCodeRaw =
    typeof address.country_code === "string"
      ? address.country_code.trim()
      : ""
  const countryCode = countryCodeRaw.toUpperCase()

  if (!addressLine || !city || !postCode || !countryCode) {
    return null
  }

  const emails =
    typeof order.email === "string" && order.email.trim()
      ? [order.email.trim()]
      : undefined
  const phone =
    typeof address.phone === "string" && address.phone.trim()
      ? address.phone.trim()
      : undefined
  const taxcode = resolvePartnerTaxcode(order) ?? undefined

  return {
    name,
    address: {
      country_code: countryCode,
      post_code: postCode,
      city,
      address: addressLine,
    },
    emails,
    phone,
    taxcode,
  }
}

export const applyBillingoPartnerMetadata = (
  metadata: Record<string, unknown>,
  partnerId: number
) => {
  const existingPayload = resolveMetadataRecord(metadata.billingo_payload)
  const payload = {
    ...(existingPayload ?? {}),
    partner_id: partnerId,
  }

  return {
    ...metadata,
    billingo_partner_id: partnerId,
    billingo_payload: payload,
  }
}

export const createBillingoPartner = async (
  order: OrderDTO,
  config: BillingoConfig
) => {
  const payload = resolvePartnerPayload(order)
  if (!payload) {
    throw new Error(
      "Billingo: partner data missing (address, city, postal code, country code)"
    )
  }

  return billingoRequest<BillingoPartner>(config, "/partners", {
    method: "POST",
    body: JSON.stringify(payload),
  })
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
  const invoiceBlockIdRaw =
    process.env.BILLINGO_INVOICE_BLOCK_ID?.trim()
  if (!apiKey || !invoiceBlockIdRaw) {
    return null
  }

  const invoiceBlockId = parsePositiveNumber(invoiceBlockIdRaw)
  if (!invoiceBlockId) {
    return null
  }

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
  const invoiceOrderUnitPriceAsNet = readBooleanFlag(
    process.env.BILLINGO_INVOICE_ORDER_UNIT_PRICE_NET
  )
  const invoiceBankAccountId = parsePositiveNumber(
    process.env.BILLINGO_INVOICE_BANK_ACCOUNT_ID?.trim() ??
      process.env.BILLINGO_BANK_ACCOUNT_ID?.trim()
  )
  const timeoutMsRaw = process.env.BILLINGO_TIMEOUT_MS?.trim()
  const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : DEFAULT_TIMEOUT_MS

  return {
    apiKey,
    baseUrl: process.env.BILLINGO_BASE_URL?.trim() || DEFAULT_BASE_URL,
    invoiceBlockId,
    paymentMethodDefault,
    electronic,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS,
    defaultDocumentType,
    invoiceLanguage,
    invoiceUnit,
    invoiceUnitPriceType,
    invoiceOrderUnitPriceAsNet,
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
    const requestBodyRaw = parseBodyForLog(options.body)
    const requestBodySummary = summarizePayloadForLog(requestBodyRaw)
    const method = (options.method ?? "GET").toUpperCase()

    if (isBillingoDebugEnabled()) {
      console.info("[Billingo] request", {
        path,
        method,
        timeoutMs: config.timeoutMs,
        baseUrl: config.baseUrl,
        body: requestBodySummary,
      })
    }

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
      const errorRecord = data as {
        message?: unknown
        errors?: unknown
      }
      console.error("[Billingo] request failed", {
        path,
        method,
        status: response.status,
        statusText: response.statusText,
        message:
          typeof errorRecord?.message === "string"
            ? errorRecord.message
            : undefined,
        request_body: requestBodySummary,
        errors: errorRecord?.errors,
        errors_json: (() => {
          try {
            return JSON.stringify(errorRecord?.errors ?? null)
          } catch {
            return null
          }
        })(),
        data,
      })
      throw new BillingoRequestError({
        status: response.status,
        statusText: response.statusText,
        message,
        path,
        method,
        requestBody: requestBodySummary,
        responseData: data,
      })
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

const parseBillingoBankAccounts = (payload: unknown) => {
  if (Array.isArray(payload)) {
    return payload.filter(
      (entry): entry is BillingoBankAccount =>
        Boolean(entry) && typeof entry === "object"
    )
  }

  if (payload && typeof payload === "object") {
    const data = (payload as BillingoBankAccountListResponse).data
    if (Array.isArray(data)) {
      return data.filter(
        (entry): entry is BillingoBankAccount =>
          Boolean(entry) && typeof entry === "object"
      )
    }
  }

  return []
}

const resolveInvoiceBankAccountId = async (
  config: BillingoConfig
) => {
  if (config.invoiceBankAccountId) {
    return config.invoiceBankAccountId
  }

  const response = await billingoRequest<unknown>(
    config,
    "/bank-accounts",
    {
      method: "GET",
    }
  )
  const accounts = parseBillingoBankAccounts(response)
  for (const account of accounts) {
    const parsedId = readNumber(account.id)
    if (parsedId && parsedId > 0) {
      return parsedId
    }
  }

  return undefined
}

export const createBillingoDocument = async (
  order: OrderDTO,
  config: BillingoConfig,
  type?: BillingoDocumentType
) => {
  const currency = order.currency_code?.toUpperCase() || "EUR"
  const documentType = type ?? resolveBillingoDocumentType(order, config)
  const decimals = resolveDecimals(currency)
  const documentDate = toDateString(
    (order as OrderDTO & { created_at?: string | Date }).created_at
  )
  const extraPayload = resolveExtraPayload(order, documentType)
  const conversionRate = await resolveConversionRate({
    config,
    currency,
    documentType,
    documentDate,
    extraPayload,
  })
  const paymentMethod = resolvePaymentMethod(
    order,
    config.paymentMethodDefault
  )

  if (documentType === "invoice" && !config.invoiceBlockId) {
    throw new Error("Billingo: invoice block id is missing")
  }

  const shippingMethod = order.shipping_methods?.[0]
  const shippingMethodRecord =
    shippingMethod &&
    typeof shippingMethod === "object" &&
    !Array.isArray(shippingMethod)
      ? (shippingMethod as unknown as Record<string, unknown>)
      : null
  const shippingMethodSubtotal = shippingMethodRecord
    ? readNumber(
        shippingMethodRecord.subtotal,
        shippingMethodRecord.amount,
        shippingMethodRecord.raw_subtotal,
        shippingMethodRecord.raw_amount,
        shippingMethodRecord.original_subtotal,
        shippingMethodRecord.raw_original_subtotal
      )
    : null
  const shippingMethodGross = shippingMethodRecord
    ? readNumber(
        shippingMethodRecord.total,
        shippingMethodRecord.raw_total,
        shippingMethodRecord.original_total,
        shippingMethodRecord.raw_original_total
      )
    : null
  const shippingMethodTaxTotal = shippingMethodRecord
    ? readNumber(
        shippingMethodRecord.tax_total,
        shippingMethodRecord.raw_tax_total,
        shippingMethodRecord.original_tax_total,
        shippingMethodRecord.raw_original_tax_total
      )
    : null
  const orderRecord = order as unknown as Record<string, unknown>
  const totalGross =
    readNumber(
      orderRecord.total,
      orderRecord.raw_total,
      orderRecord.original_total
    ) ?? null
  const itemGross =
    readNumber(
      orderRecord.item_total,
      orderRecord.raw_item_total,
      orderRecord.original_item_total
    ) ?? null
  const taxTotal =
    readNumber(
      orderRecord.tax_total,
      orderRecord.raw_tax_total,
      orderRecord.original_tax_total
    ) ?? null
  const itemTaxTotal =
    readNumber(
      orderRecord.item_tax_total,
      orderRecord.raw_item_tax_total,
      orderRecord.original_item_tax_total
    ) ?? null
  let globalVatRate =
    itemGross && itemTaxTotal
      ? resolveVatRateFromTotals(itemGross, itemTaxTotal)
      : totalGross && taxTotal
        ? resolveVatRateFromTotals(totalGross, taxTotal)
        : null
  let globalVat =
    typeof globalVatRate === "number"
      ? normalizeBillingoVat(formatVat(globalVatRate))
      : null
  const shippingSubtotal =
    readNumber(
      orderRecord.shipping_subtotal,
      orderRecord.raw_shipping_subtotal,
      orderRecord.original_shipping_subtotal
    ) ??
    shippingMethodSubtotal ??
    0
  const shippingOriginalGross =
    readNumber(
      orderRecord.original_shipping_total,
      orderRecord.raw_original_shipping_total
    ) ??
    shippingMethodGross ??
    null
  let shippingGross =
    readNumber(
      orderRecord.shipping_total,
      orderRecord.raw_shipping_total,
      orderRecord.original_shipping_total
    ) ??
    shippingMethodGross ??
    0
  if (
    (!shippingGross || shippingGross <= 0) &&
    totalGross &&
    itemGross &&
    totalGross > itemGross
  ) {
    shippingGross = totalGross - itemGross
  }
  const shippingTaxTotalOriginal =
    readNumber(
      orderRecord.original_shipping_tax_total,
      orderRecord.raw_original_shipping_tax_total
    ) ??
    shippingMethodTaxTotal ??
    null
  let shippingTaxTotal =
    readNumber(
      orderRecord.shipping_tax_total,
      orderRecord.raw_shipping_tax_total,
      orderRecord.original_shipping_tax_total
    ) ??
    shippingMethodTaxTotal ??
    null
  if (
    shippingSubtotal > 0 &&
    shippingTaxTotal !== null &&
    Number.isFinite(shippingTaxTotal)
  ) {
    shippingGross = shippingSubtotal + shippingTaxTotal
  } else if (
    (!shippingGross || shippingGross <= 0) &&
    shippingSubtotal > 0 &&
    typeof globalVatRate === "number"
  ) {
    shippingGross = shippingSubtotal * (1 + globalVatRate / 100)
  } else if (!shippingGross || shippingGross <= 0) {
    shippingGross = shippingSubtotal
  }
  if (!shippingTaxTotal || shippingTaxTotal <= 0) {
    if (taxTotal && itemTaxTotal && taxTotal > itemTaxTotal) {
      shippingTaxTotal = taxTotal - itemTaxTotal
    }
  }
  const summaryRecord =
    orderRecord.summary &&
    typeof orderRecord.summary === "object" &&
    !Array.isArray(orderRecord.summary)
      ? (orderRecord.summary as Record<string, unknown>)
      : null
  const summaryTotal =
    summaryRecord
      ? readNumber(
          summaryRecord.paid_total,
          summaryRecord.raw_paid_total,
          summaryRecord.current_order_total,
          summaryRecord.raw_current_order_total
        )
      : null
  const orderTotal =
    readNumber(orderRecord.total, orderRecord.raw_total) ?? null
  const targetTotal =
    typeof orderTotal === "number" ? orderTotal : summaryTotal
  const targetTotalRounded =
    typeof targetTotal === "number"
      ? roundTo(targetTotal, decimals)
      : null
  const originalOrderTotal =
    readNumber(
      orderRecord.original_total,
      orderRecord.raw_original_total
    ) ?? null
  const discountGross =
    typeof originalOrderTotal === "number" &&
    typeof orderTotal === "number"
      ? Math.max(originalOrderTotal - orderTotal, 0)
      : readNumber(
          orderRecord.discount_total,
          orderRecord.raw_discount_total,
          orderRecord.item_discount_total,
          orderRecord.raw_item_discount_total,
          orderRecord.shipping_discount_total,
          orderRecord.raw_shipping_discount_total
        ) ?? 0
  const discountPercentRaw =
    typeof originalOrderTotal === "number" &&
    originalOrderTotal > 0 &&
    Number.isFinite(discountGross) &&
    discountGross > 0
      ? (discountGross / originalOrderTotal) * 100
      : null
  const discountPercent =
    typeof discountPercentRaw === "number" &&
    Number.isFinite(discountPercentRaw)
      ? Math.min(
          Math.max(roundTo(discountPercentRaw, 2), 0),
          100
        )
      : null
  const hasReliableDiscountedItemTotals = (order.items ?? []).some(
    (item) => {
      if (!item || typeof item !== "object") {
        return false
      }
      const record = item as unknown as Record<string, unknown>
      const value = readNumber(
        record.total,
        record.item_total,
        record.raw_total,
        record.raw_item_total
      )
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0
      )
    }
  )
  const usePercentDiscount =
    documentType === "invoice" &&
    typeof discountPercent === "number" &&
    discountPercent > 0 &&
    !hasReliableDiscountedItemTotals
  const shippingLineGross =
    usePercentDiscount &&
    typeof shippingOriginalGross === "number" &&
    shippingOriginalGross > 0
      ? shippingOriginalGross
      : shippingGross
  const shippingLineTaxTotal =
    usePercentDiscount && typeof shippingTaxTotalOriginal === "number"
      ? shippingTaxTotalOriginal
      : shippingTaxTotal
  let effectiveShippingLineGross = shippingLineGross
  let effectiveShippingLineTaxTotal = shippingLineTaxTotal
  if (
    (!effectiveShippingLineGross ||
      effectiveShippingLineGross <= 0) &&
    typeof shippingSubtotal === "number" &&
    shippingSubtotal > 0 &&
    typeof effectiveShippingLineTaxTotal === "number" &&
    Number.isFinite(effectiveShippingLineTaxTotal) &&
    effectiveShippingLineTaxTotal > 0
  ) {
    effectiveShippingLineGross =
      shippingSubtotal + effectiveShippingLineTaxTotal
  }
  if (
    (!effectiveShippingLineGross ||
      effectiveShippingLineGross <= 0) &&
    typeof shippingSubtotal === "number" &&
    shippingSubtotal > 0
  ) {
    effectiveShippingLineGross = shippingSubtotal
  }
  if (
    (!effectiveShippingLineTaxTotal ||
      effectiveShippingLineTaxTotal <= 0) &&
    typeof taxTotal === "number" &&
    typeof itemTaxTotal === "number" &&
    taxTotal > itemTaxTotal
  ) {
    effectiveShippingLineTaxTotal = taxTotal - itemTaxTotal
  }
  if (
    (!effectiveShippingLineGross ||
      effectiveShippingLineGross <= 0) &&
    typeof effectiveShippingLineTaxTotal === "number" &&
    Number.isFinite(effectiveShippingLineTaxTotal) &&
    effectiveShippingLineTaxTotal > 0 &&
    typeof globalVatRate === "number" &&
    globalVatRate > 0
  ) {
    const net = effectiveShippingLineTaxTotal / (globalVatRate / 100)
    if (Number.isFinite(net) && net > 0) {
      effectiveShippingLineGross = net + effectiveShippingLineTaxTotal
    }
  }
  if (
    globalVatRate === null &&
    typeof targetTotalRounded === "number"
  ) {
    const derivedVatRate = resolveVatRateFromTotals(
      targetTotalRounded,
      taxTotal
    )
    if (typeof derivedVatRate === "number") {
      globalVatRate = derivedVatRate
      globalVat = normalizeBillingoVat(formatVat(derivedVatRate))
    }
  }
  const shippingVatFallback = resolveVatFromTotals(
    effectiveShippingLineGross,
    effectiveShippingLineTaxTotal
  )
  const shippingVatFromLines = resolveItemVat(
    shippingMethod?.tax_lines ?? null
  )
  const shippingVat =
    shippingVatFromLines === "0%"
      ? usePercentDiscount
        ? globalVat ?? shippingVatFallback ?? shippingVatFromLines
        : shippingVatFallback ?? globalVat ?? shippingVatFromLines
      : shippingVatFromLines

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
        readNumber(
          record.unit_price,
          record.raw_unit_price,
          detail?.unit_price,
          detail?.raw_unit_price
        ) ?? 0
      const originalTotal =
        readNumber(
          record.original_total,
          record.raw_original_total,
          detail?.original_total,
          detail?.raw_original_total,
          record.total,
          record.item_total,
          detail?.total,
          detail?.item_total,
          detail?.raw_total,
          detail?.raw_item_total
        ) ?? unitPrice * quantity
      const subtotal =
        readNumber(
          record.subtotal,
          record.raw_subtotal,
          detail?.subtotal,
          detail?.raw_subtotal,
          record.original_subtotal,
          record.raw_original_subtotal,
          detail?.original_subtotal,
          detail?.raw_original_subtotal
        ) ?? unitPrice * quantity
      const discount =
        readNumber(
          record.discount_total,
          record.raw_discount_total,
          record.discount_subtotal,
          record.raw_discount_subtotal,
          detail?.discount_total,
          detail?.raw_discount_total
        ) ?? 0
      const lineTotalOriginal =
        readNumber(
          record.original_total,
          record.raw_original_total,
          record.subtotal,
          record.raw_subtotal,
          record.total,
          record.item_total,
          record.raw_total,
          record.raw_item_total,
          detail?.original_total,
          detail?.raw_original_total,
          detail?.subtotal,
          detail?.raw_subtotal,
          detail?.total,
          detail?.item_total,
          detail?.raw_total,
          detail?.raw_item_total
        ) ?? unitPrice * quantity
      const lineTotalDiscounted =
        readNumber(
          record.total,
          record.item_total,
          record.raw_total,
          record.raw_item_total,
          detail?.total,
          detail?.item_total,
          detail?.raw_total,
          detail?.raw_item_total
        ) ??
        Math.max(originalTotal - discount, 0) ??
        Math.max(subtotal - discount, 0)
      const lineTotal = usePercentDiscount
        ? lineTotalOriginal
        : lineTotalDiscounted
      const taxTotal =
        readNumber(
          record.tax_total,
          record.item_tax_total,
          record.raw_tax_total,
          record.raw_item_tax_total,
          detail?.tax_total,
          detail?.raw_tax_total
        ) ?? null
      const vatFromLines = resolveItemVat(item.tax_lines ?? null)
      const derivedVat = usePercentDiscount
        ? globalVat ?? resolveVatFromTotals(lineTotal, taxTotal)
        : resolveVatFromTotals(lineTotal, taxTotal) ?? globalVat
      const vat =
        vatFromLines === "0%"
          ? derivedVat ?? vatFromLines
          : vatFromLines

      return {
        title: resolveBillingoItemTitle(record, detail),
        quantity,
        lineTotal,
        vat,
        isTaxInclusive: readBoolean(
          record.is_tax_inclusive,
          detail?.is_tax_inclusive
        ),
        orderUnitPrice:
          readNumber(
            record.unit_price,
            record.raw_unit_price,
            detail?.unit_price,
            detail?.raw_unit_price
          ) ?? null,
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
        isTaxInclusive: boolean | null
        orderUnitPrice: number | null
      } => Boolean(item)
    )

  if (effectiveShippingLineGross > 0) {
    baseItems.push({
      title: "Szállítási költség",
      quantity: 1,
      lineTotal: effectiveShippingLineGross,
      vat: shippingVat,
      isTaxInclusive: null,
      orderUnitPrice: null,
    })
  }

  const scalingTarget = usePercentDiscount
    ? typeof originalOrderTotal === "number"
      ? roundTo(originalOrderTotal, decimals)
      : null
    : targetTotalRounded

  if (
    typeof scalingTarget === "number" &&
    baseItems.length > 0
  ) {
    const sumGross = baseItems.reduce(
      (sum, item) => sum + item.lineTotal,
      0
    )
    const tolerance = Math.pow(10, -decimals)
    if (
      Number.isFinite(sumGross) &&
      sumGross > 0 &&
      Math.abs(sumGross - scalingTarget) >= tolerance
    ) {
      const ratio = scalingTarget / sumGross
      if (Number.isFinite(ratio) && ratio > 0) {
        let running = 0
        baseItems = baseItems.map((item, index) => {
          if (index === baseItems.length - 1) {
            const adjusted = roundTo(
              scalingTarget - running,
              decimals
            )
            return {
              ...item,
              lineTotal: Math.max(adjusted, 0),
            }
          }
          const adjusted = roundTo(
            item.lineTotal * ratio,
            decimals
          )
          running += adjusted
          return {
            ...item,
            lineTotal: Math.max(adjusted, 0),
          }
        })
      }
    }
  }

  const observedAmountValues: number[] = []
  const maybePushAmountValue = (
    value: number | null | undefined
  ) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return
    }
    observedAmountValues.push(value)
  }

  maybePushAmountValue(targetTotalRounded)
  maybePushAmountValue(totalGross)
  maybePushAmountValue(itemGross)
  maybePushAmountValue(taxTotal)
  maybePushAmountValue(shippingGross)
  maybePushAmountValue(shippingSubtotal)
  maybePushAmountValue(shippingTaxTotal)
  maybePushAmountValue(originalOrderTotal)
  for (const item of baseItems) {
    maybePushAmountValue(item.lineTotal)
  }

  let amountMode = inferAmountModeFromOrder({
    currency,
    values: observedAmountValues,
  })

  const estimateBillingoTotal = (mode: BillingoAmountMode) => {
    return roundTo(
      baseItems.reduce((sum, item) => {
        const normalized = normalizeAmountForBillingo({
          amount: item.lineTotal,
          currency,
          mode,
        })
        return sum + normalized
      }, 0),
      decimals
    )
  }

  const estimatedWithInitialMode = estimateBillingoTotal(amountMode)
  if (
    shouldSwitchAmountModeForMismatch({
      mode: amountMode,
      targetTotal: targetTotalRounded,
      estimatedTotal: estimatedWithInitialMode,
    })
  ) {
    console.warn("[Billingo] amount mode auto-correction applied", {
      orderId: order.id,
      currency,
      fromMode: amountMode,
      toMode: "major",
      targetTotal: targetTotalRounded,
      estimatedTotal: estimatedWithInitialMode,
    })
    amountMode = "major"
  } else if (amountMode === "minor") {
    console.warn("[Billingo] using inferred minor-unit order totals", {
      orderId: order.id,
      currency,
      estimatedTotal: estimatedWithInitialMode,
    })
  }

  if (!baseItems.length) {
    if (documentType === "invoice") {
      throw new Error("Billingo: invoice items missing")
    }

    const fallbackTotal =
      typeof targetTotalRounded === "number"
        ? targetTotalRounded
        : readNumber(
            orderRecord.total,
            orderRecord.subtotal,
            orderRecord.item_total,
            orderRecord.raw_total,
            orderRecord.raw_subtotal,
            orderRecord.raw_item_total
          ) ?? 0
    if (fallbackTotal > 0) {
      const fallbackItemTotal =
        effectiveShippingLineGross > 0
          ? Math.max(fallbackTotal - effectiveShippingLineGross, 0)
          : fallbackTotal
      if (fallbackItemTotal > 0) {
        baseItems = [
          {
            title: "Rendelés összesen",
            quantity: 1,
            lineTotal: fallbackItemTotal,
            vat: resolveItemVat(shippingMethod?.tax_lines ?? null),
            isTaxInclusive: null,
            orderUnitPrice: null,
          },
        ]
      }
    }
  }

  if (documentType === "receipt") {
    const items: BillingoReceiptItem[] = baseItems
      .map((item) => {
        const unitPrice = roundTo(
          normalizeAmountForBillingo({
            amount: item.lineTotal,
            currency,
            mode: amountMode,
          }),
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
      .filter(
        (item) =>
          Number.isFinite(item.unit_price) && item.unit_price > 0
      )

    if (!items.length) {
      throw new Error("Billingo: no receipt items available")
    }

    const basePayload: BillingoReceiptPayload = {
      vendor_id: resolveVendorId(order, "receipt"),
      name: resolveCustomerName(order),
      emails: order.email ? [order.email] : undefined,
      block_id: config.invoiceBlockId,
      type: "receipt",
      payment_method: paymentMethod,
      currency,
      electronic: config.electronic,
      items,
    }

    if (conversionRate) {
      basePayload.conversion_rate = conversionRate
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
      const forceNetFromOrderUnitPrice =
        config.invoiceOrderUnitPriceAsNet === true &&
        item.isTaxInclusive === false &&
        typeof item.orderUnitPrice === "number" &&
        Number.isFinite(item.orderUnitPrice) &&
        item.orderUnitPrice > 0
      const unitPriceType: BillingoConfig["invoiceUnitPriceType"] =
        forceNetFromOrderUnitPrice ? "net" : config.invoiceUnitPriceType
      const unitPrice = forceNetFromOrderUnitPrice
        ? roundTo(
            normalizeAmountForBillingo({
              amount: item.orderUnitPrice!,
              currency,
              mode: amountMode,
            }),
            decimals
          )
        : resolveInvoiceUnitPrice({
            lineTotal: item.lineTotal,
            quantity: item.quantity,
            currency,
            vat: item.vat,
            unitPriceType,
            amountMode,
          })
      return {
        name: item.title,
        unit_price: unitPrice,
        unit_price_type: unitPriceType,
        quantity: item.quantity,
        unit: config.invoiceUnit,
        vat: item.vat,
      }
    })
    .filter(
      (item) =>
        Number.isFinite(item.unit_price) && item.unit_price > 0
    )

  if (!items.length) {
    throw new Error("Billingo: no invoice items available")
  }

  const bankAccountIdOverride = readNumber(
    extraPayload?.bank_account_id
  )
  const invoiceBankAccountId =
    bankAccountIdOverride && bankAccountIdOverride > 0
      ? bankAccountIdOverride
      : await resolveInvoiceBankAccountId(config)

  const basePayload: BillingoInvoicePayload = {
    vendor_id: resolveVendorId(order, "invoice"),
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

  if (conversionRate) {
    basePayload.conversion_rate = conversionRate
  }

  if (invoiceBankAccountId) {
    basePayload.bank_account_id = invoiceBankAccountId
  }

  if (usePercentDiscount) {
    basePayload.discount = {
      type: "percent",
      value: discountPercent!,
    }
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
    if (!buffer.length) {
      throw new Error("Billingo PDF response is empty")
    }

    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? ""
    const headerSample = buffer
      .subarray(0, Math.min(buffer.length, 1024))
      .toString("latin1")
    const hasPdfHeader = headerSample.includes("%PDF")
    const isPdfContentType = contentType.includes("application/pdf")

    if (!hasPdfHeader) {
      throw new Error(
        `Billingo PDF response is not a valid PDF payload (content-type: ${
          contentType || "unknown"
        })`
      )
    }

    return buffer.toString("base64")
  } finally {
    clearTimeout(timeout)
  }
}
