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

type GlsAddress = {
  Name: string
  Street: string
  HouseNumber: string
  HouseNumberInfo?: string
  City: string
  ZipCode: string
  CountryIsoCode: string
  ContactName?: string
  ContactPhone?: string
  ContactEmail?: string
}

type GlsService = {
  Code: string
  PSDParameter?: {
    StringValue?: string
    IntegerValue?: number
  }
}

type GlsParcelProperty = {
  Content: string
  PackageType: number
  Height: number
  Length: number
  Width: number
  Weight: number
}

type GlsParcel = {
  ClientNumber: number
  ClientReference: string
  Count?: number
  CODAmount?: number
  CODReference?: string
  Content?: string
  PickupDate?: string
  PickupAddress: GlsAddress
  DeliveryAddress: GlsAddress
  ServiceList?: GlsService[]
  ParcelPropertyList?: GlsParcelProperty[]
}

type GlsLabelOptions = {
  typeOfPrinter?: string
  printPosition?: number
  showPrintDialog?: boolean
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
  pickupAddress: GlsAddress
  labelOptions?: GlsLabelOptions
  webshopEngine: string
  dimensionUnit: "cm" | "mm"
  parcelDefaults: {
    weightKg?: number
    lengthCm?: number
    widthCm?: number
    heightCm?: number
    packageType: number
  }
}

export type GlsShipmentInput = {
  order: OrderDTO
  fulfillment: FulfillmentDTO
  pickup?: GlsPickupPoint | null
}

export type GlsShipmentResult = {
  request: Record<string, unknown>
  response: unknown
  labelBase64?: string
  parcelIds?: number[]
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

const resolvePasswordEncoding = (
  value?: string | null,
  format?: string
) => {
  if (value === "array" || value === "base64") {
    return value
  }

  if (format?.toLowerCase() === "json") {
    return "array"
  }

  return "base64"
}

const parseNumber = (value?: string | null) => {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const normalizeNumericValue = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

const parsePositiveNumber = (value: unknown) => {
  const parsed = normalizeNumericValue(value)
  return parsed && parsed > 0 ? parsed : undefined
}

const normalizeDimensionUnit = (value?: string | null) => {
  return value?.toLowerCase() === "mm" ? "mm" : "cm"
}

const normalizeDimensionValue = (
  value: number,
  unit: "cm" | "mm"
) => {
  const normalized = unit === "mm" ? value / 10 : value
  return Number(normalized.toFixed(2))
}

const parseBoolean = (value?: string | null) => {
  if (!value) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "true") {
    return true
  }
  if (normalized === "false") {
    return false
  }

  return undefined
}

const formatGlsDate = (value: Date) => `/Date(${value.getTime()})/`

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

const splitStreetAndHouseNumber = (value?: string | null) => {
  const normalized = normalizeString(value)
  if (!normalized) {
    return {
      street: "",
      houseNumber: "",
      houseNumberInfo: undefined,
    }
  }

  const match =
    normalized.match(/^(.+?)\s+(\d+)(.*)$/) ||
    normalized.match(/^(\d+)\s+(.+)$/)

  if (match) {
    if (match.length === 4) {
      const [, street, houseNumber, rest] = match
      const houseNumberInfo = normalizeOptionalString(rest)

      return {
        street: normalizeString(street),
        houseNumber,
        houseNumberInfo,
      }
    }

    if (match.length === 3) {
      const [, houseNumber, street] = match
      return {
        street: normalizeString(street),
        houseNumber,
        houseNumberInfo: undefined,
      }
    }
  }

  return {
    street: normalized,
    houseNumber: "",
    houseNumberInfo: undefined,
  }
}

const buildEndpoint = (
  config: GlsConfig,
  methodOverride?: string
) => {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const serviceName = normalizeServiceName(config.serviceName)
  const format = config.format.replace(/^\//, "").trim()
  const methodName = (
    methodOverride ?? config.methodName
  ).replace(/^\//, "").trim()

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
  const pickupName = normalizeString(process.env.GLS_PICKUP_NAME)
  const pickupStreet = normalizeString(process.env.GLS_PICKUP_STREET)
  const pickupHouseNumber = normalizeString(
    process.env.GLS_PICKUP_HOUSE_NUMBER
  )
  const pickupCity = normalizeString(process.env.GLS_PICKUP_CITY)
  const pickupZip = normalizeString(process.env.GLS_PICKUP_ZIP)
  const pickupCountry = normalizeString(process.env.GLS_PICKUP_COUNTRY_CODE)
  const webshopEngine =
    normalizeString(process.env.GLS_WEBSHOP_ENGINE) || "Medusa"
  const dimensionUnit = normalizeDimensionUnit(
    process.env.GLS_DIMENSION_UNIT
  )

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

  if (!pickupName) {
    missing.push("GLS_PICKUP_NAME")
  }

  if (!pickupStreet) {
    missing.push("GLS_PICKUP_STREET")
  }

  if (!pickupHouseNumber) {
    missing.push("GLS_PICKUP_HOUSE_NUMBER")
  }

  if (!pickupCity) {
    missing.push("GLS_PICKUP_CITY")
  }

  if (!pickupZip) {
    missing.push("GLS_PICKUP_ZIP")
  }

  if (!pickupCountry) {
    missing.push("GLS_PICKUP_COUNTRY_CODE")
  }

  if (missing.length) {
    return { missing }
  }

  const format =
    normalizeString(process.env.GLS_API_FORMAT) || "json"
  const labelOptions: GlsLabelOptions = {
    typeOfPrinter: normalizeOptionalString(
      process.env.GLS_LABEL_PRINTER_TYPE
    ),
    printPosition: parseNumber(
      process.env.GLS_LABEL_PRINT_POSITION
    ),
    showPrintDialog: parseBoolean(
      process.env.GLS_LABEL_SHOW_PRINT_DIALOG
    ),
  }

  return {
    missing,
    config: {
      baseUrl: normalizeString(process.env.GLS_API_BASE_URL) ||
        "https://api.mygls.hu",
      serviceName,
      methodName,
      format,
      username,
      password,
      clientNumbers,
      webshopEngine,
      dimensionUnit,
      parcelDefaults: {
        weightKg: parsePositiveNumber(
          process.env.GLS_PARCEL_WEIGHT_KG
        ),
        lengthCm: parsePositiveNumber(
          process.env.GLS_PARCEL_LENGTH_CM
        ),
        widthCm: parsePositiveNumber(
          process.env.GLS_PARCEL_WIDTH_CM
        ),
        heightCm: parsePositiveNumber(
          process.env.GLS_PARCEL_HEIGHT_CM
        ),
        packageType:
          parsePositiveNumber(
            process.env.GLS_PARCEL_PACKAGE_TYPE
          ) ?? 1,
      },
      passwordEncoding: resolvePasswordEncoding(
        process.env.GLS_PASSWORD_ENCODING,
        format
      ),
      timeoutMs:
        Number(process.env.GLS_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
      pickupAddress: {
        Name: pickupName,
        Street: pickupStreet,
        HouseNumber: pickupHouseNumber,
        HouseNumberInfo: normalizeOptionalString(
          process.env.GLS_PICKUP_HOUSE_NUMBER_INFO
        ),
        City: pickupCity,
        ZipCode: pickupZip,
        CountryIsoCode: pickupCountry.toUpperCase(),
        ContactName:
          normalizeOptionalString(
            process.env.GLS_PICKUP_CONTACT_NAME
          ) || pickupName,
        ContactPhone: normalizeOptionalString(
          process.env.GLS_PICKUP_CONTACT_PHONE
        ),
        ContactEmail: normalizeOptionalString(
          process.env.GLS_PICKUP_CONTACT_EMAIL
        ),
      },
      labelOptions,
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
    WebshopEngine: config.webshopEngine,
  }
}

const resolveAddressName = (order: OrderDTO) => {
  const address = order.shipping_address
  const company = normalizeOptionalString(address?.company)
  const person = [
    normalizeOptionalString(address?.first_name),
    normalizeOptionalString(address?.last_name),
  ]
    .filter(Boolean)
    .join(" ")
    .trim()

  return company || person || normalizeOptionalString(order.email) || "Customer"
}

const buildDeliveryAddress = (
  order: OrderDTO
): GlsAddress | null => {
  const address = order.shipping_address
  if (!address) {
    return null
  }

  const { street, houseNumber, houseNumberInfo } =
    splitStreetAndHouseNumber(address.address_1)

  const fallbackHouseInfo = normalizeOptionalString(address.address_2)
  const mergedHouseInfo = [houseNumberInfo, fallbackHouseInfo]
    .filter(Boolean)
    .join(" ")
    .trim()

  const name = resolveAddressName(order)
  const city = normalizeOptionalString(address.city)
  const zip = normalizeOptionalString(address.postal_code)
  const country = normalizeOptionalString(
    address.country_code?.toUpperCase()
  )

  if (
    !name ||
    !street ||
    !houseNumber ||
    !city ||
    !zip ||
    !country
  ) {
    return null
  }

  return {
    Name: name,
    Street: street,
    HouseNumber: houseNumber,
    HouseNumberInfo: mergedHouseInfo || undefined,
    City: city,
    ZipCode: zip,
    CountryIsoCode: country,
    ContactName: name,
    ContactPhone: normalizeOptionalString(address.phone),
    ContactEmail: normalizeOptionalString(order.email),
  }
}

const resolveOrderReference = (order: OrderDTO) => {
  const displayId = order.display_id

  if (Number.isFinite(displayId)) {
    return `TG-${displayId.toString().padStart(6, "0")}`
  }

  return order.id
}

const resolveParcelCount = (order: OrderDTO) => {
  const metadata =
    (order.metadata as Record<string, unknown> | null) ?? null
  const rawCount = metadata?.gls_parcel_count

  if (typeof rawCount === "number" && rawCount > 0) {
    return Math.min(99, Math.round(rawCount))
  }

  const computedCount = computeParcelCountFromItems(order)
  if (computedCount) {
    return computedCount
  }

  return 1
}

const computeParcelCountFromItems = (order: OrderDTO) => {
  const items = Array.isArray(order.items) ? order.items : []
  let count = 0

  for (const item of items) {
    if (item?.requires_shipping === false) {
      continue
    }

    const quantity =
      typeof item?.quantity === "number" ? item.quantity : undefined

    if (quantity && quantity > 0) {
      count += quantity
    }
  }

  if (!count) {
    return undefined
  }

  return Math.min(99, Math.max(1, Math.round(count)))
}

const buildParcelContent = (order: OrderDTO, reference: string) => {
  const items = Array.isArray(order.items) ? order.items : []
  const titles = items
    .map((item) =>
      normalizeOptionalString(
        item.product_title ?? item.title ?? ""
      )
    )
    .filter(Boolean)

  const base = titles.length
    ? titles.join(", ")
    : `Order ${reference}`

  return base.length > 64 ? `${base.slice(0, 61)}...` : base
}

const resolveItemQuantity = (item: unknown) => {
  const quantity =
    typeof (item as { quantity?: unknown })?.quantity === "number"
      ? (item as { quantity?: number }).quantity
      : undefined
  return quantity && quantity > 0 ? quantity : 0
}

const resolveItemCandidate = (item: unknown, key: string) => {
  if (!item || typeof item !== "object") {
    return undefined
  }

  const record = item as Record<string, unknown>
  const variant = record.variant as Record<string, unknown> | null
  const product =
    (variant?.product as Record<string, unknown> | null) ?? null
  const inventory =
    (
      (variant?.inventory_items as Array<Record<string, unknown>> | null)?.[0]
        ?.inventory as Record<string, unknown> | null
    ) ?? null
  const metadata = record.metadata as Record<string, unknown> | null

  return (
    variant?.[key] ??
    product?.[key] ??
    inventory?.[key] ??
    metadata?.[key] ??
    metadata?.[`${key}_cm`] ??
    metadata?.[`gls_${key}_cm`]
  )
}

const resolveItemWeight = (item: unknown) => {
  if (!item || typeof item !== "object") {
    return undefined
  }

  const record = item as Record<string, unknown>
  const variant = record.variant as Record<string, unknown> | null
  const product =
    (variant?.product as Record<string, unknown> | null) ?? null
  const inventory =
    (
      (variant?.inventory_items as Array<Record<string, unknown>> | null)?.[0]
        ?.inventory as Record<string, unknown> | null
    ) ?? null
  const metadata = record.metadata as Record<string, unknown> | null

  return (
    variant?.weight ??
    product?.weight ??
    inventory?.weight ??
    metadata?.weight ??
    metadata?.weight_kg ??
    metadata?.gls_weight_kg
  )
}

const computeTotalWeightKg = (order: OrderDTO) => {
  const items = Array.isArray(order.items) ? order.items : []
  let total = 0
  let hasWeight = false

  for (const item of items) {
    const weight = parsePositiveNumber(resolveItemWeight(item))
    if (!weight) {
      continue
    }

    const quantity = resolveItemQuantity(item)
    if (!quantity) {
      continue
    }

    total += weight * quantity
    hasWeight = true
  }

  return hasWeight ? total : undefined
}

const computeMaxDimension = (
  order: OrderDTO,
  key: "length" | "width" | "height"
) => {
  const items = Array.isArray(order.items) ? order.items : []
  let maxValue: number | undefined

  for (const item of items) {
    const value = parsePositiveNumber(resolveItemCandidate(item, key))
    if (!value) {
      continue
    }

    if (!maxValue || value > maxValue) {
      maxValue = value
    }
  }

  return maxValue
}

export const deriveGlsParcelMetadata = (
  order: OrderDTO,
  defaults: GlsConfig["parcelDefaults"],
  dimensionUnit: GlsConfig["dimensionUnit"]
) => {
  const metadata =
    (order.metadata as Record<string, unknown> | null) ?? {}
  const updates: Record<string, unknown> = {}
  const existingCount =
    typeof metadata.gls_parcel_count === "number" &&
    metadata.gls_parcel_count > 0
      ? Math.min(99, Math.round(metadata.gls_parcel_count))
      : undefined
  const computedCount = computeParcelCountFromItems(order)
  const parcelCount = existingCount ?? computedCount ?? 1

  if (!existingCount && computedCount) {
    updates.gls_parcel_count = parcelCount
  }

  const existingWeight = parsePositiveNumber(metadata.gls_weight_kg)
  const computedWeight = computeTotalWeightKg(order)
  const weight =
    existingWeight ??
    (computedWeight && parcelCount > 0
      ? Number((computedWeight / parcelCount).toFixed(2))
      : undefined) ??
    defaults.weightKg
  if (
    weight &&
    (existingWeight === undefined || existingWeight !== weight)
  ) {
    updates.gls_weight_kg = weight
  }

  const existingLength = parsePositiveNumber(metadata.gls_length_cm)
  const rawLength =
    defaults.lengthCm ??
    (existingLength === undefined ? undefined : existingLength) ??
    computeMaxDimension(order, "length")
  const length =
    existingLength !== undefined && !defaults.lengthCm
      ? existingLength
      : rawLength
        ? normalizeDimensionValue(rawLength, dimensionUnit)
        : undefined
  if (
    length &&
    (existingLength === undefined || existingLength !== length)
  ) {
    updates.gls_length_cm = length
  }

  const existingWidth = parsePositiveNumber(metadata.gls_width_cm)
  const rawWidth =
    defaults.widthCm ??
    (existingWidth === undefined ? undefined : existingWidth) ??
    computeMaxDimension(order, "width")
  const width =
    existingWidth !== undefined && !defaults.widthCm
      ? existingWidth
      : rawWidth
        ? normalizeDimensionValue(rawWidth, dimensionUnit)
        : undefined
  if (
    width &&
    (existingWidth === undefined || existingWidth !== width)
  ) {
    updates.gls_width_cm = width
  }

  const existingHeight = parsePositiveNumber(metadata.gls_height_cm)
  const rawHeight =
    defaults.heightCm ??
    (existingHeight === undefined ? undefined : existingHeight) ??
    computeMaxDimension(order, "height")
  const height =
    existingHeight !== undefined && !defaults.heightCm
      ? existingHeight
      : rawHeight
        ? normalizeDimensionValue(rawHeight, dimensionUnit)
        : undefined
  if (
    height &&
    (existingHeight === undefined || existingHeight !== height)
  ) {
    updates.gls_height_cm = height
  }

  const existingPackageType = parsePositiveNumber(
    metadata.gls_package_type
  )
  const packageType = existingPackageType ?? defaults.packageType
  if (!existingPackageType && packageType) {
    updates.gls_package_type = packageType
  }

  return {
    metadata: { ...metadata, ...updates },
    updates,
  }
}

const resolveParcelWeightInfo = (
  input: GlsShipmentInput,
  defaults: GlsConfig["parcelDefaults"]
) => {
  const metadata =
    (input.order.metadata as Record<string, unknown> | null) ?? null

  const explicitWeight =
    parsePositiveNumber(metadata?.gls_weight_kg) ??
    defaults.weightKg

  if (explicitWeight) {
    return { weight: explicitWeight, isExplicit: true }
  }

  const candidates = [
    input.fulfillment?.data
      ? (input.fulfillment.data as Record<string, unknown>)
          .total_weight_kg
      : undefined,
    input.fulfillment?.data
      ? (input.fulfillment.data as Record<string, unknown>)
          .total_weight
      : undefined,
    input.order.shipping_methods?.[0]?.data?.total_weight_kg,
    input.order.shipping_methods?.[0]?.data?.total_weight,
    computeTotalWeightKg(input.order),
  ]

  for (const candidate of candidates) {
    const parsed = parsePositiveNumber(candidate)
    if (parsed) {
      return { weight: parsed, isExplicit: false }
    }
  }

  return undefined
}

const resolveParcelDimensions = (
  input: GlsShipmentInput,
  defaults: GlsConfig["parcelDefaults"],
  dimensionUnit: GlsConfig["dimensionUnit"]
) => {
  const metadata =
    (input.order.metadata as Record<string, unknown> | null) ?? null

  const metadataLength = parsePositiveNumber(metadata?.gls_length_cm)
  const metadataWidth = parsePositiveNumber(metadata?.gls_width_cm)
  const metadataHeight = parsePositiveNumber(metadata?.gls_height_cm)

  const rawLength =
    defaults.lengthCm ??
    metadataLength ??
    computeMaxDimension(input.order, "length")
  const rawWidth =
    defaults.widthCm ??
    metadataWidth ??
    computeMaxDimension(input.order, "width")
  const rawHeight =
    defaults.heightCm ??
    metadataHeight ??
    computeMaxDimension(input.order, "height")

  const length =
    metadataLength !== undefined && !defaults.lengthCm
      ? metadataLength
      : rawLength
        ? normalizeDimensionValue(rawLength, dimensionUnit)
        : undefined
  const width =
    metadataWidth !== undefined && !defaults.widthCm
      ? metadataWidth
      : rawWidth
        ? normalizeDimensionValue(rawWidth, dimensionUnit)
        : undefined
  const height =
    metadataHeight !== undefined && !defaults.heightCm
      ? metadataHeight
      : rawHeight
        ? normalizeDimensionValue(rawHeight, dimensionUnit)
        : undefined
  const packageType =
    parsePositiveNumber(metadata?.gls_package_type) ??
    defaults.packageType

  return {
    length,
    width,
    height,
    packageType,
  }
}

const buildParcelPropertyList = (
  input: GlsShipmentInput,
  config: GlsConfig,
  reference: string,
  parcelCount: number
) => {
  const weightInfo = resolveParcelWeightInfo(
    input,
    config.parcelDefaults
  )
  const { length, width, height, packageType } =
    resolveParcelDimensions(
      input,
      config.parcelDefaults,
      config.dimensionUnit
    )

  if (
    !weightInfo ||
    !length ||
    !width ||
    !height ||
    !packageType
  ) {
    return undefined
  }

  const weightPerParcel =
    weightInfo.isExplicit || parcelCount <= 1
      ? weightInfo.weight
      : Number((weightInfo.weight / parcelCount).toFixed(2))

  return Array.from({ length: parcelCount }, () => ({
    Content: buildParcelContent(input.order, reference),
    PackageType: packageType,
    Height: height,
    Length: length,
    Width: width,
    Weight: weightPerParcel,
  }))
}

const buildServiceList = (
  pickup?: GlsPickupPoint | null
): GlsService[] | undefined => {
  const pickupId = pickup?.id?.trim()

  if (!pickupId) {
    return undefined
  }

  return [
    {
      Code: "PSD",
      PSDParameter: {
        StringValue: pickupId,
      },
    },
  ]
}

export const buildGlsShipmentRequest = (
  input: GlsShipmentInput,
  config: GlsConfig
) => {
  const deliveryAddress = buildDeliveryAddress(input.order)

  if (!deliveryAddress) {
    throw new Error("GLS: missing or invalid delivery address")
  }

  const clientNumber = config.clientNumbers[0]
  if (!clientNumber) {
    throw new Error("GLS: missing client number")
  }

  const reference = resolveOrderReference(input.order)
  const parcelCount = resolveParcelCount(input.order)
  const parcelProperties = buildParcelPropertyList(
    input,
    config,
    reference,
    parcelCount
  )

  return {
    ...buildGlsAuthPayload(config),
    ParcelList: [
      {
        ClientNumber: clientNumber,
        ClientReference: reference,
        Count: parcelCount,
        Content: buildParcelContent(input.order, reference),
        PickupDate: formatGlsDate(new Date()),
        PickupAddress: config.pickupAddress,
        DeliveryAddress: deliveryAddress,
        ServiceList: buildServiceList(input.pickup),
        ...(parcelProperties
          ? { ParcelPropertyList: parcelProperties }
          : {}),
      },
    ],
    ...(config.labelOptions?.typeOfPrinter
      ? { TypeOfPrinter: config.labelOptions.typeOfPrinter }
      : {}),
    ...(typeof config.labelOptions?.printPosition === "number"
      ? { PrintPosition: config.labelOptions.printPosition }
      : {}),
    ...(typeof config.labelOptions?.showPrintDialog === "boolean"
      ? { ShowPrintDialog: config.labelOptions.showPrintDialog }
      : {}),
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

const sanitizeResponse = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return payload
  }

  const sanitized = { ...(payload as Record<string, unknown>) }

  if ("Labels" in sanitized) {
    sanitized.Labels = "***"
  }

  if ("labels" in sanitized) {
    sanitized.labels = "***"
  }

  return sanitized
}

const normalizeParcelId = (value: unknown) => {
  const parsed = normalizeNumericValue(value)
  if (!parsed || parsed <= 0) {
    return null
  }

  return Math.round(parsed)
}

const normalizeParcelNumberValue = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  return null
}

export const extractParcelIds = (payload: unknown) => {
  const ids = new Set<number>()

  if (!payload || typeof payload !== "object") {
    return []
  }

  const seen = new Set<object>()
  const stack: unknown[] = [payload]

  while (stack.length) {
    const current = stack.pop()
    if (!current || typeof current !== "object") {
      continue
    }

    if (seen.has(current as object)) {
      continue
    }
    seen.add(current as object)

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item)
      }
      continue
    }

    const record = current as Record<string, unknown>
    const candidate =
      normalizeParcelId(record.ParcelId) ??
      normalizeParcelId(record.parcelId)

    if (candidate) {
      ids.add(candidate)
    }

    for (const value of Object.values(record)) {
      stack.push(value)
    }
  }

  return Array.from(ids)
}

export const findParcelIdsByNumbers = (
  payload: unknown,
  parcelNumbers: string[]
) => {
  const ids = new Set<number>()
  const wanted = new Set(
    parcelNumbers
      .map((value) => normalizeParcelNumberValue(value))
      .filter((value): value is string => Boolean(value))
  )

  if (!wanted.size || !payload || typeof payload !== "object") {
    return []
  }

  const seen = new Set<object>()
  const stack: unknown[] = [payload]

  while (stack.length) {
    const current = stack.pop()
    if (!current || typeof current !== "object") {
      continue
    }

    if (seen.has(current as object)) {
      continue
    }
    seen.add(current as object)

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item)
      }
      continue
    }

    const record = current as Record<string, unknown>
    const numberCandidate =
      normalizeParcelNumberValue(record.ParcelNumberWithCheckdigit) ??
      normalizeParcelNumberValue(record.ParcelNumber)
    const idCandidate = normalizeParcelId(record.ParcelId)

    if (
      numberCandidate &&
      idCandidate &&
      wanted.has(numberCandidate)
    ) {
      ids.add(idCandidate)
    }

    for (const value of Object.values(record)) {
      stack.push(value)
    }
  }

  return Array.from(ids)
}

const coerceLabelValue = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "number")
  ) {
    return Buffer.from(value as number[]).toString("base64")
  }

  return null
}

const extractLabelBase64 = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return undefined
  }

  const seen = new Set<object>()
  const stack: unknown[] = [payload]

  while (stack.length) {
    const current = stack.pop()
    if (!current || typeof current !== "object") {
      continue
    }

    if (seen.has(current as object)) {
      continue
    }
    seen.add(current as object)

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item)
      }
      continue
    }

    const record = current as Record<string, unknown>
    for (const [key, value] of Object.entries(record)) {
      if (key.toLowerCase() === "labels") {
        const label = coerceLabelValue(value)
        if (label) {
          return label
        }
      }
    }

    for (const value of Object.values(record)) {
      stack.push(value)
    }
  }

  return undefined
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

    const labelBase64 = extractLabelBase64(data) ?? undefined
    const parcelIds = extractParcelIds(data)

    return {
      request: sanitizeRequest(request),
      response: sanitizeResponse(data),
      labelBase64,
      parcelIds: parcelIds.length ? parcelIds : undefined,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export const getGlsParcelList = async (
  config: GlsConfig,
  params: {
    pickupDateFrom?: Date
    pickupDateTo?: Date
    printDateFrom?: Date
    printDateTo?: Date
  }
) => {
  const methodName =
    normalizeString(process.env.GLS_PARCEL_LIST_METHOD) ||
    "GetParcelList"
  const endpoint = buildEndpoint(config, methodName)

  const request: Record<string, unknown> = {
    ...buildGlsAuthPayload(config),
  }

  if (params.pickupDateFrom) {
    request.PickupDateFrom = formatGlsDate(params.pickupDateFrom)
  }
  if (params.pickupDateTo) {
    request.PickupDateTo = formatGlsDate(params.pickupDateTo)
  }
  if (params.printDateFrom) {
    request.PrintDateFrom = formatGlsDate(params.printDateFrom)
  }
  if (params.printDateTo) {
    request.PrintDateTo = formatGlsDate(params.printDateTo)
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
      response: sanitizeResponse(data),
    }
  } finally {
    clearTimeout(timeout)
  }
}

export const deleteGlsLabels = async (
  parcelIds: number[],
  config: GlsConfig
) => {
  const methodName =
    normalizeString(process.env.GLS_DELETE_LABEL_METHOD) ||
    "DeleteLabels"
  const endpoint = buildEndpoint(config, methodName)
  const request = {
    ...buildGlsAuthPayload(config),
    ParcelIdList: parcelIds,
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
      response: sanitizeResponse(data),
    }
  } finally {
    clearTimeout(timeout)
  }
}
