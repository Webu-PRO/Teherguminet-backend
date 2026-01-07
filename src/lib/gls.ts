import crypto from "crypto"
import type {
  FulfillmentDTO,
  OrderDTO,
  OrderShippingMethodDTO,
} from "@medusajs/types"

export const GLS_METADATA_KEY = "gls_pickup"

export type GlsPickupPoint = {
  id: string
  oldId?: string
  title?: string
  address?: string
  postalcode?: string
  city?: string
  provider?: string
}

type GlsConfig = {
  baseUrl: string
  serviceName: string
  methodName: string
  format: string
  username: string
  password: string
  clientNumbers: number[]
  passwordEncoding: "base64" | "array"
  timeoutMs: number
}

export type GlsShipmentInput = {
  order: OrderDTO
  fulfillment: FulfillmentDTO
  pickup: GlsPickupPoint
}

export type GlsShipmentResult = {
  request: Record<string, unknown>
  response: unknown
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

const parseClientNumbers = (value?: string) => {
  if (!value) {
    return []
  }

  return value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry))
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

const resolvePasswordEncoding = (value?: string | null) => {
  return value === "array" ? "array" : "base64"
}

const buildPasswordValue = (
  password: string,
  encoding: "base64" | "array"
) => {
  const digest = crypto
    .createHash("sha512")
    .update(password, "utf8")
    .digest()

  // GLS expects the SHA512 bytes, which JSON typically carries as base64.
  return encoding === "array" ? Array.from(digest) : digest.toString("base64")
}

const normalizeServiceName = (serviceName: string) =>
  serviceName.replace(/\.svc$/i, "")

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, "")

const buildEndpoint = (config: GlsConfig) => {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const serviceName = normalizeServiceName(config.serviceName)
  const format = config.format.replace(/^\//, "").trim()
  const methodName = config.methodName.replace(/^\//, "").trim()

  return `${baseUrl}/${serviceName}.svc/${format}/${methodName}`
}

export const resolveGlsConfig = (): {
  config?: GlsConfig
  missing: string[]
} => {
  const missing: string[] = []

  const serviceName = normalizeString(process.env.GLS_API_SERVICE)
  const methodName = normalizeString(process.env.GLS_API_METHOD)
  const username = normalizeString(process.env.GLS_USERNAME)
  const password = normalizeString(process.env.GLS_PASSWORD)
  const clientNumbers = parseClientNumbers(process.env.GLS_CLIENT_NUMBERS)

  if (!serviceName) {
    missing.push("GLS_API_SERVICE")
  }

  if (!methodName) {
    missing.push("GLS_API_METHOD")
  }

  if (!username) {
    missing.push("GLS_USERNAME")
  }

  if (!password) {
    missing.push("GLS_PASSWORD")
  }

  if (!clientNumbers.length) {
    missing.push("GLS_CLIENT_NUMBERS")
  }

  if (missing.length) {
    return { missing }
  }

  return {
    missing,
    config: {
      baseUrl: normalizeString(process.env.GLS_API_BASE_URL) ||
        "https://api.mygls.hu",
      serviceName,
      methodName,
      format: normalizeString(process.env.GLS_API_FORMAT) || "json",
      username,
      password,
      clientNumbers,
      passwordEncoding: resolvePasswordEncoding(
        process.env.GLS_PASSWORD_ENCODING
      ),
      timeoutMs:
        Number(process.env.GLS_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    },
  }
}

export const normalizeGlsPickupPoint = (
  input?: Partial<GlsPickupPoint> | null
): GlsPickupPoint | null => {
  if (!input || typeof input !== "object") {
    return null
  }

  const id = normalizeString(input.id)
  if (!id) {
    return null
  }

  return {
    id,
    oldId: normalizeOptionalString(input.oldId),
    title: normalizeOptionalString(input.title),
    address: normalizeOptionalString(input.address),
    postalcode: normalizeOptionalString(input.postalcode),
    city: normalizeOptionalString(input.city),
    provider: normalizeOptionalString(input.provider),
  }
}

export const readGlsPickupFromMetadata = (
  metadata?: Record<string, unknown> | null
) => {
  if (!metadata || typeof metadata !== "object") {
    return null
  }

  return normalizeGlsPickupPoint(
    metadata[GLS_METADATA_KEY] as Partial<GlsPickupPoint>
  )
}

export const isGlsShippingMethod = (
  method?: OrderShippingMethodDTO | null
) => {
  if (!method) {
    return false
  }

  return isGlsShippingOption({
    id: method.shipping_option_id,
    name: method.name,
    data: method.data,
    metadata: method.metadata ?? undefined,
  })
}

type GlsShippingOptionLike = {
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

const hasGlsToken = (value?: string | null) =>
  typeof value === "string" && value.toLowerCase().includes("gls")

const resolveConfiguredTypeIds = () =>
  parseCsvValues(process.env.GLS_SHIPPING_OPTION_TYPE_IDS)

const resolveConfiguredOptionIds = () =>
  parseCsvValues(process.env.GLS_SHIPPING_OPTION_IDS)

export const isGlsShippingOption = (
  option?: GlsShippingOptionLike | null
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
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase())

  if (tokens.some((value) => value.includes("gls"))) {
    return true
  }

  const dataValues = [
    option.data ?? undefined,
    option.metadata ?? undefined,
  ]
    .filter((value): value is Record<string, unknown> => Boolean(value))
    .flatMap((record) => Object.values(record))

  return dataValues.some(
    (value) => typeof value === "string" && value.toLowerCase().includes("gls")
  )
}

const buildGlsAuthPayload = (config: GlsConfig) => {
  return {
    Username: config.username,
    Password: buildPasswordValue(
      config.password,
      config.passwordEncoding
    ),
    ClientNumberList: config.clientNumbers,
  }
}

const buildRecipient = (order: OrderDTO) => {
  const address = order.shipping_address

  return {
    name: [
      normalizeOptionalString(address?.first_name),
      normalizeOptionalString(address?.last_name),
    ]
      .filter(Boolean)
      .join(" ")
      .trim(),
    address_1: normalizeOptionalString(address?.address_1),
    address_2: normalizeOptionalString(address?.address_2),
    city: normalizeOptionalString(address?.city),
    postal_code: normalizeOptionalString(address?.postal_code),
    country_code: normalizeOptionalString(
      address?.country_code?.toUpperCase()
    ),
    phone: normalizeOptionalString(address?.phone),
    email: normalizeOptionalString(order.email),
  }
}

export const buildGlsShipmentRequest = (
  input: GlsShipmentInput,
  config: GlsConfig
) => {
  const recipient = buildRecipient(input.order)

  return {
    ...buildGlsAuthPayload(config),
    // TODO: Map this payload to the GLS create shipment schema.
    shipment: {
      reference: input.order.display_id ?? input.order.id,
      fulfillment_id: input.fulfillment.id,
      pickup_point: input.pickup,
      recipient,
    },
  }
}

const sanitizeRequest = (payload: Record<string, unknown>) => {
  if (!payload || typeof payload !== "object") {
    return payload
  }

  const sanitized = { ...payload }
  if ("Password" in sanitized) {
    sanitized.Password = "***"
  }

  return sanitized
}

export const createGlsShipment = async (
  input: GlsShipmentInput,
  config: GlsConfig
): Promise<GlsShipmentResult> => {
  const endpoint = buildEndpoint(config)
  const request = buildGlsShipmentRequest(input, config)

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    config.timeoutMs
  )

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })

    const text = await response.text()
    let data: unknown = text

    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }

    if (!response.ok) {
      throw new Error(
        `GLS API error (${response.status} ${response.statusText})`
      )
    }

    return {
      request: sanitizeRequest(request),
      response: data,
    }
  } finally {
    clearTimeout(timeout)
  }
}
