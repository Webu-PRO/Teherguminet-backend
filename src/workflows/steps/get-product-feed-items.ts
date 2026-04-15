import { CalculatedPriceSet } from "@medusajs/framework/types";
import {
  getTotalVariantAvailability,
  getVariantAvailability,
  QueryContext,
} from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  DESCRIPTION_HU_KEYS,
  DESCRIPTION_SK_KEYS,
  TITLE_HU_KEYS,
  TITLE_SK_KEYS,
  normalizeText as normalizeLocalizedText,
} from "../../lib/product-localization";

export type FeedItem = {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link?: string;
  additional_image_link?: string;
  availability: string;
  quantity?: number;
  price: string;
  sale_price?: string;
  google_product_category?: string;
  size?: string;
  size_chart?: string;
  shipping_weight?: string;
  availability_date?: string;
  certification?: string;
  shipping?: FeedShipping[];
  item_group_id: string;
  condition?: string;
  brand?: string;
};

type FeedShipping = {
  country: string;
  price: string;
  service?: string;
};

type StepInput = {
  currency_code: string;
  country_code: string;
};

type ProductImage = {
  url?: string | null;
} | null;

type QueryStockLocation = {
  address?: {
    country_code?: string | null;
  } | null;
} | null;

type QuerySalesChannel = {
  id?: string | null;
  stock_locations?: QueryStockLocation[] | null;
} | null;

type QueryVariant = {
  id: string;
  manage_inventory?: boolean | null;
  allow_backorder?: boolean | null;
  weight?: unknown;
  metadata?: Record<string, unknown> | null;
  calculated_price?: CalculatedPriceSet | null;
} | null;

type QueryProduct = {
  id: string;
  title?: unknown;
  description?: unknown;
  metadata?: Record<string, unknown> | null;
  handle?: string | null;
  thumbnail?: string | null;
  images?: ProductImage[] | null;
  variants?: QueryVariant[] | null;
  sales_channels?: QuerySalesChannel[] | null;
};

type QueryProductLocalization = {
  id: string
  product_id?: string | null
  title_hu?: string | null
  title_sk?: string | null
  description_hu?: string | null
  description_sk?: string | null
}

const ABSOLUTE_URL_PREFIX_REGEX = /^[a-z][a-z\d+\-.]*:\/\//i;
const BRAND_METADATA_KEYS = [
  "brand",
  "márka",
  "marka",
  "manufacturer",
  "gyártó",
  "gyarto",
] as const;
const KNOWN_FEED_BRANDS = [
  "HUBTRAC",
  "AEROTYRE",
  "SUPERWAY",
  "GROUNDSPEED",
] as const;
const GOOGLE_PRODUCT_CATEGORY_METADATA_KEYS = [
  "google_product_category",
  "google product category",
  "google_category",
  "gpc",
] as const;
const SIZE_METADATA_KEYS = [
  "size",
  "méret",
  "meret",
  "abroncs_meret",
  "abroncs méret",
] as const;
const SIZE_CHART_METADATA_KEYS = [
  "size_chart",
  "size chart",
  "size_chart_url",
  "size chart url",
  "sizechart",
  "mérettáblázat",
  "merettablazat",
] as const;
const AVAILABILITY_DATE_METADATA_KEYS = [
  "availability_date",
  "availability date",
  "availabilityDate",
  "backorder_date",
  "backorder date",
  "backorderDate",
  "expected_availability_date",
  "expected availability date",
  "expectedAvailabilityDate",
] as const;
const CERTIFICATION_METADATA_KEYS = [
  "certification",
  "certification_code",
  "certification code",
  "eprel",
  "eprel_code",
  "eprel code",
] as const;
const SHIPPING_WEIGHT_KG_METADATA_KEYS = [
  "shipping_weight_kg",
  "shippingWeightKg",
  "weight_kg",
  "weightKg",
  "gls_weight_kg",
  "glsWeightKg",
] as const;
const SHIPPING_WEIGHT_G_METADATA_KEYS = [
  "shipping_weight_g",
  "shippingWeightG",
  "weight_g",
  "weightG",
  "gls_weight_g",
  "glsWeightG",
] as const;
const SHIPPING_WEIGHT_RAW_METADATA_KEYS = [
  "shipping_weight",
  "shippingWeight",
  "weight",
] as const;
const SHIPPING_PRICE_METADATA_KEYS = [
  "shipping_price",
  "shippingPrice",
  "shipping_cost",
  "shippingCost",
] as const;
const SHIPPING_SERVICE_METADATA_KEYS = [
  "shipping_service",
  "shippingService",
  "shipping_method",
  "shippingMethod",
] as const;
const LABEL_IMAGE_HINTS = [
  "label",
  "eprel",
  "energylabel",
  "energy-label",
  "tirelabel",
  "tyrelabel",
  "tire-label",
  "tyre-label",
  "eu-label",
  "eulabel",
] as const;

export const formatPrice = (price: number, currencyCode: string) => {
  return `${Number(price).toFixed(2)} ${currencyCode.toUpperCase()}`;
};

export const normalizeAvailabilityQuantity = (
  quantity: number | null | undefined
) => {
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
    return 0;
  }

  return Math.max(0, Math.floor(quantity));
};

export const resolveFeedStock = ({
  manageInventory,
  allowBackorder,
  quantity,
}: {
  manageInventory?: boolean | null;
  allowBackorder?: boolean | null;
  quantity: number | null | undefined;
}) => {
  if (!manageInventory) {
    return {
      status: "in stock" as const,
      quantity: undefined,
    };
  }

  const normalizedQuantity = normalizeAvailabilityQuantity(quantity);

  if (normalizedQuantity <= 0 && allowBackorder === true) {
    return {
      status: "backorder" as const,
      quantity: undefined,
    };
  }

  return {
    status: normalizedQuantity > 0 ? ("in stock" as const) : ("out of stock" as const),
    quantity: normalizedQuantity,
  };
};

const normalizeText = (value: unknown) => {
  const trimmed = normalizeLocalizedText(value)
  return trimmed.length ? trimmed : undefined
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const getMetadataValue = (
  metadata: Record<string, unknown> | null | undefined,
  keys: readonly string[]
) => {
  if (!metadata) {
    return undefined;
  }

  const normalizedKeys = keys.map((key) => key.toLowerCase());
  for (const [metadataKey, metadataValue] of Object.entries(metadata)) {
    if (!normalizedKeys.includes(metadataKey.toLowerCase())) {
      continue;
    }

    const value = normalizeText(metadataValue);
    if (value) {
      return value;
    }
  }

  return undefined;
};

const getMetadataRawValue = (
  metadata: Record<string, unknown> | null | undefined,
  keys: readonly string[]
) => {
  if (!metadata) {
    return undefined;
  }

  const normalizedKeys = keys.map((key) => key.toLowerCase());
  for (const [metadataKey, metadataValue] of Object.entries(metadata)) {
    if (!normalizedKeys.includes(metadataKey.toLowerCase())) {
      continue;
    }

    if (metadataValue === null || metadataValue === undefined) {
      continue;
    }

    return metadataValue;
  }

  return undefined;
};

const resolveNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length) {
    const normalized = Number(value.replace(",", "."));
    return Number.isFinite(normalized) ? normalized : null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.numeric === "number" && Number.isFinite(record.numeric)) {
      return record.numeric;
    }

    if (record.value !== undefined) {
      const nested = resolveNumber(record.value);
      if (nested !== null) {
        return nested;
      }
    }
  }

  return null;
};

const inferKnownBrandFromText = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  for (const brand of KNOWN_FEED_BRANDS) {
    const pattern = new RegExp(`\\b${brand}\\b`, "i");
    if (pattern.test(value)) {
      return brand;
    }
  }

  return undefined;
};

export const resolveFeedBrand = (input: {
  product: {
    handle?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  variant?: {
    metadata?: Record<string, unknown> | null;
  } | null;
  localizedTitle: string;
  localizedDescription: string;
}) => {
  const variantMetadataBrand = getMetadataValue(
    toRecord(input.variant?.metadata),
    BRAND_METADATA_KEYS
  );
  const productMetadataBrand = getMetadataValue(
    toRecord(input.product.metadata),
    BRAND_METADATA_KEYS
  );
  const metadataBrand = variantMetadataBrand ?? productMetadataBrand;

  if (metadataBrand) {
    return inferKnownBrandFromText(metadataBrand) ?? metadataBrand;
  }

  return (
    inferKnownBrandFromText(normalizeText(input.product.handle)) ??
    inferKnownBrandFromText(input.localizedTitle) ??
    inferKnownBrandFromText(input.localizedDescription) ??
    undefined
  );
};

const resolveMetadataFieldFromProductVariant = (input: {
  productMetadata?: Record<string, unknown> | null;
  variantMetadata?: Record<string, unknown> | null;
  keys: readonly string[];
}) => {
  return (
    getMetadataValue(toRecord(input.variantMetadata), input.keys) ??
    getMetadataValue(toRecord(input.productMetadata), input.keys)
  );
};

const resolveRawMetadataFieldFromProductVariant = (input: {
  productMetadata?: Record<string, unknown> | null;
  variantMetadata?: Record<string, unknown> | null;
  keys: readonly string[];
}) => {
  return (
    getMetadataRawValue(toRecord(input.variantMetadata), input.keys) ??
    getMetadataRawValue(toRecord(input.productMetadata), input.keys)
  );
};

const maybeResolveAbsoluteUrl = (
  value: string | undefined,
  storefrontBaseUrl: string
) => {
  if (!value) {
    return undefined;
  }

  return toAbsoluteUrl(value, storefrontBaseUrl) ?? value;
};

const extractSizeFromTitle = (title: string) => {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) {
    return undefined;
  }

  const match = normalizedTitle.match(/^\s*([0-9]{3}\/[0-9]{2}R[0-9]{2}(?:[.,][0-9])?)/i);
  if (!match?.[1]) {
    return undefined;
  }

  return match[1].replace(",", ".");
};

export const resolveFeedGoogleProductCategory = (input: {
  productMetadata?: Record<string, unknown> | null;
  variantMetadata?: Record<string, unknown> | null;
}) => {
  return resolveMetadataFieldFromProductVariant({
    productMetadata: input.productMetadata,
    variantMetadata: input.variantMetadata,
    keys: GOOGLE_PRODUCT_CATEGORY_METADATA_KEYS,
  });
};

export const resolveFeedSize = (input: {
  localizedTitle: string;
  productMetadata?: Record<string, unknown> | null;
  variantMetadata?: Record<string, unknown> | null;
}) => {
  return (
    resolveMetadataFieldFromProductVariant({
      productMetadata: input.productMetadata,
      variantMetadata: input.variantMetadata,
      keys: SIZE_METADATA_KEYS,
    }) ?? extractSizeFromTitle(input.localizedTitle)
  );
};

export const resolveFeedSizeChart = (input: {
  storefrontBaseUrl: string;
  productMetadata?: Record<string, unknown> | null;
  variantMetadata?: Record<string, unknown> | null;
}) => {
  const rawValue = resolveMetadataFieldFromProductVariant({
    productMetadata: input.productMetadata,
    variantMetadata: input.variantMetadata,
    keys: SIZE_CHART_METADATA_KEYS,
  });

  return maybeResolveAbsoluteUrl(rawValue, input.storefrontBaseUrl);
};

const transformUpperTokenToTitleCase = (token: string) => {
  if (!token || !/[A-Za-z]/.test(token)) {
    return token;
  }

  if (/[a-z]/.test(token)) {
    return token;
  }

  if (/\d/.test(token) || token.length <= 2) {
    return token;
  }

  const first = token.charAt(0);
  const rest = token.slice(1).toLowerCase();
  return `${first}${rest}`;
};

const normalizeUppercaseToken = (token: string) => {
  return token
    .split("-")
    .map((part) => transformUpperTokenToTitleCase(part))
    .join("-");
};

export const normalizeGoogleFeedTitle = (title: string) => {
  const normalized = normalizeText(title);
  if (!normalized) {
    return "";
  }

  if (!/[A-Z]/.test(normalized) || /[a-z]/.test(normalized)) {
    return normalized;
  }

  return normalized
    .split(/(\s+)/)
    .map((token) => (/\s+/.test(token) ? token : normalizeUppercaseToken(token)))
    .join("")
    .trim();
};

const formatWeight = (value: number) => {
  return Number(value.toFixed(3)).toString();
};

export const resolveFeedShippingWeight = (input: {
  variantWeight?: unknown;
  productMetadata?: Record<string, unknown> | null;
  variantMetadata?: Record<string, unknown> | null;
}) => {
  const variantWeight = resolveNumber(input.variantWeight);
  if (variantWeight && variantWeight > 0) {
    return `${formatWeight(variantWeight)} kg`;
  }

  const kgFromMetadata = resolveNumber(
    resolveRawMetadataFieldFromProductVariant({
      productMetadata: input.productMetadata,
      variantMetadata: input.variantMetadata,
      keys: SHIPPING_WEIGHT_KG_METADATA_KEYS,
    })
  );
  if (kgFromMetadata && kgFromMetadata > 0) {
    return `${formatWeight(kgFromMetadata)} kg`;
  }

  const gramsFromMetadata = resolveNumber(
    resolveRawMetadataFieldFromProductVariant({
      productMetadata: input.productMetadata,
      variantMetadata: input.variantMetadata,
      keys: SHIPPING_WEIGHT_G_METADATA_KEYS,
    })
  );
  if (gramsFromMetadata && gramsFromMetadata > 0) {
    return `${formatWeight(gramsFromMetadata / 1000)} kg`;
  }

  const rawWeightFromMetadata = resolveNumber(
    resolveRawMetadataFieldFromProductVariant({
      productMetadata: input.productMetadata,
      variantMetadata: input.variantMetadata,
      keys: SHIPPING_WEIGHT_RAW_METADATA_KEYS,
    })
  );
  if (rawWeightFromMetadata && rawWeightFromMetadata > 0) {
    return `${formatWeight(rawWeightFromMetadata)} kg`;
  }

  return undefined;
};

const normalizeFeedDate = (value: unknown) => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  const text = normalizeText(value);
  if (!text) {
    return undefined;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
};

const resolveBackorderDays = () => {
  const parsed = Number.parseInt(process.env.PRODUCT_FEED_BACKORDER_DAYS ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 365) {
    return parsed;
  }

  return 14;
};

const resolveDefaultBackorderAvailabilityDate = () => {
  const days = resolveBackorderDays();
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
};

export const resolveFeedAvailabilityDate = (input: {
  availability: string;
  productMetadata?: Record<string, unknown> | null;
  variantMetadata?: Record<string, unknown> | null;
}) => {
  const metadataDate = resolveMetadataFieldFromProductVariant({
    productMetadata: input.productMetadata,
    variantMetadata: input.variantMetadata,
    keys: AVAILABILITY_DATE_METADATA_KEYS,
  });

  const normalizedMetadataDate = normalizeFeedDate(metadataDate);
  if (normalizedMetadataDate) {
    return normalizedMetadataDate;
  }

  const normalizedAvailability = input.availability
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

  if (
    normalizedAvailability === "backorder" ||
    normalizedAvailability === "preorder"
  ) {
    return resolveDefaultBackorderAvailabilityDate();
  }

  return undefined;
};

export const resolveFeedCertification = (input: {
  productMetadata?: Record<string, unknown> | null;
  variantMetadata?: Record<string, unknown> | null;
}) => {
  return resolveMetadataFieldFromProductVariant({
    productMetadata: input.productMetadata,
    variantMetadata: input.variantMetadata,
    keys: CERTIFICATION_METADATA_KEYS,
  });
};

const resolveFeedShippingPrice = (input: {
  currencyCode: string;
  productMetadata?: Record<string, unknown> | null;
  variantMetadata?: Record<string, unknown> | null;
}) => {
  const metadataPrice = resolveRawMetadataFieldFromProductVariant({
    productMetadata: input.productMetadata,
    variantMetadata: input.variantMetadata,
    keys: SHIPPING_PRICE_METADATA_KEYS,
  });

  const numericPrice = resolveNumber(metadataPrice);
  if (numericPrice !== null && numericPrice >= 0) {
    return formatPrice(numericPrice, input.currencyCode);
  }

  const textPrice = normalizeText(metadataPrice);
  if (textPrice) {
    return textPrice;
  }

  const defaultShippingPrice = resolveNumber(process.env.PRODUCT_FEED_DEFAULT_SHIPPING_PRICE);
  if (defaultShippingPrice !== null && defaultShippingPrice >= 0) {
    return formatPrice(defaultShippingPrice, input.currencyCode);
  }

  return formatPrice(0, input.currencyCode);
};

const resolveFeedShippingService = (input: {
  productMetadata?: Record<string, unknown> | null;
  variantMetadata?: Record<string, unknown> | null;
}) => {
  return (
    resolveMetadataFieldFromProductVariant({
      productMetadata: input.productMetadata,
      variantMetadata: input.variantMetadata,
      keys: SHIPPING_SERVICE_METADATA_KEYS,
    }) ??
    normalizeText(process.env.PRODUCT_FEED_SHIPPING_SERVICE) ??
    "Standard"
  );
};

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

const normalizeCountryCode = (value: unknown) => {
  const normalized = normalizeText(value)?.toUpperCase();
  if (!normalized || !COUNTRY_CODE_PATTERN.test(normalized)) {
    return undefined;
  }

  return normalized;
};

export const resolveFeedShippingCountryCodes = (
  rawValue: string | null | undefined
) => {
  const value = normalizeText(rawValue);
  if (!value) {
    return [] as string[];
  }

  const uniqueCountryCodes = new Set<string>();
  for (const token of value.split(/[,\s;|]+/)) {
    const countryCode = normalizeCountryCode(token);
    if (!countryCode) {
      continue;
    }
    uniqueCountryCodes.add(countryCode);
  }

  return [...uniqueCountryCodes];
};

export const resolveFeedShippingEntries = (input: {
  countryCode: string;
  currencyCode: string;
  shippingCountryCodes?: string[];
  productMetadata?: Record<string, unknown> | null;
  variantMetadata?: Record<string, unknown> | null;
}) => {
  const countries = new Set<string>();
  const primaryCountry = normalizeCountryCode(input.countryCode);
  if (primaryCountry) {
    countries.add(primaryCountry);
  }

  if (Array.isArray(input.shippingCountryCodes)) {
    for (const country of input.shippingCountryCodes) {
      const countryCode = normalizeCountryCode(country);
      if (!countryCode) {
        continue;
      }
      countries.add(countryCode);
    }
  }

  if (!countries.size) {
    return undefined;
  }

  const price = resolveFeedShippingPrice({
    currencyCode: input.currencyCode,
    productMetadata: input.productMetadata,
    variantMetadata: input.variantMetadata,
  });
  const service = resolveFeedShippingService({
    productMetadata: input.productMetadata,
    variantMetadata: input.variantMetadata,
  });

  return [...countries].map((country) => ({
    country,
    price,
    ...(service ? { service } : {}),
  })) satisfies FeedShipping[];
};

export const resolveStorefrontLinkBaseUrl = (
  feedLinkUrl: string | null | undefined,
  storefrontBaseUrl: string
) => {
  const explicitLinkUrl = normalizeStorefrontUrl(feedLinkUrl);
  if (explicitLinkUrl) {
    return explicitLinkUrl;
  }

  return storefrontBaseUrl;
};

const resolveDescriptionFromSource = (
  source: Record<string, unknown> | null | undefined,
  keys: readonly string[]
) => {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  for (const key of keys) {
    const value = normalizeText(source[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
};

const resolveLocalizationRecord = (
  localization: QueryProductLocalization | null | undefined
) => {
  return {
    title_hu: normalizeText(localization?.title_hu),
    title_sk: normalizeText(localization?.title_sk),
    description_hu: normalizeText(localization?.description_hu),
    description_sk: normalizeText(localization?.description_sk),
  }
}

const readProductVariants = (product: QueryProduct) => {
  if (!Array.isArray(product.variants)) {
    return [] as Array<Exclude<QueryVariant, null>>;
  }

  const variants: Array<Exclude<QueryVariant, null>> = [];
  for (const variant of product.variants) {
    if (!variant || typeof variant.id !== "string") {
      continue;
    }
    variants.push(variant);
  }

  return variants;
};

const readSalesChannels = (product: QueryProduct) => {
  if (!Array.isArray(product.sales_channels)) {
    return [] as Array<Exclude<QuerySalesChannel, null>>;
  }

  const salesChannels: Array<Exclude<QuerySalesChannel, null>> = [];
  for (const channel of product.sales_channels) {
    if (!channel) {
      continue;
    }
    salesChannels.push(channel);
  }

  return salesChannels;
};

export const resolveLocalizedFeedDescription = (
  product: {
    description?: unknown;
    title?: unknown;
    metadata?: Record<string, unknown> | null;
  },
  countryCode: string,
  localization?: QueryProductLocalization | null
) => {
  const localizedTitle = resolveLocalizedFeedTitle(
    product,
    countryCode,
    localization
  );
  const localizationRecord = resolveLocalizationRecord(localization)
  const normalizedCountryCode = countryCode.toLowerCase();
  const isSk = normalizedCountryCode.startsWith("sk");
  const isHu = normalizedCountryCode.startsWith("hu");
  const metadataKeys = isSk
    ? DESCRIPTION_SK_KEYS
    : isHu
      ? DESCRIPTION_HU_KEYS
      : [];

  if (isSk && localizationRecord.description_sk) {
    return localizationRecord.description_sk
  }

  if (isHu && localizationRecord.description_hu) {
    return localizationRecord.description_hu
  }

  const localizedDescription = resolveDescriptionFromSource(
    product.metadata,
    metadataKeys
  );

  if (localizedDescription) {
    return localizedDescription;
  }

  if (isSk) {
    if (localizationRecord.description_hu) {
      return localizationRecord.description_hu
    }

    const fallbackToHuDescription = resolveDescriptionFromSource(
      product.metadata,
      DESCRIPTION_HU_KEYS
    );

    if (fallbackToHuDescription) {
      return fallbackToHuDescription;
    }
  }

  const defaultDescription = normalizeText(product.description);
  if (defaultDescription) {
    return defaultDescription;
  }

  return localizedTitle;
};

export const resolveLocalizedFeedTitle = (
  product: {
    title?: unknown;
    metadata?: Record<string, unknown> | null;
  },
  countryCode: string,
  localization?: QueryProductLocalization | null
) => {
  const localizationRecord = resolveLocalizationRecord(localization)
  const normalizedCountryCode = countryCode.toLowerCase();
  const isSk = normalizedCountryCode.startsWith("sk");
  const isHu = normalizedCountryCode.startsWith("hu");
  const metadataKeys = isSk
    ? TITLE_SK_KEYS
    : isHu
      ? TITLE_HU_KEYS
      : [];

  if (isSk && localizationRecord.title_sk) {
    return localizationRecord.title_sk
  }

  if (isHu && localizationRecord.title_hu) {
    return localizationRecord.title_hu
  }

  const localizedTitle = resolveDescriptionFromSource(product.metadata, metadataKeys);
  if (localizedTitle) {
    return localizedTitle;
  }

  if (isSk) {
    if (localizationRecord.title_hu) {
      return localizationRecord.title_hu
    }

    const fallbackToHuTitle = resolveDescriptionFromSource(
      product.metadata,
      TITLE_HU_KEYS
    );

    if (fallbackToHuTitle) {
      return fallbackToHuTitle;
    }
  }

  return normalizeText(product.title) || "";
};

const toAbsoluteUrl = (
  rawValue: string | null | undefined,
  storefrontBaseUrl?: string
): string | undefined => {
  const value = (rawValue ?? "").trim();

  if (!value) {
    return undefined;
  }

  let candidate = value;

  if (candidate.startsWith("//")) {
    candidate = `https:${candidate}`;
  } else if (candidate.startsWith("/")) {
    if (!storefrontBaseUrl) {
      return undefined;
    }
    candidate = `${storefrontBaseUrl}${candidate}`;
  } else if (!ABSOLUTE_URL_PREFIX_REGEX.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    return parsed.toString();
  } catch {
    return undefined;
  }
};

const normalizeStorefrontUrl = (rawValue: string | null | undefined) => {
  const absoluteUrl = toAbsoluteUrl(rawValue);

  if (!absoluteUrl) {
    return undefined;
  }

  return absoluteUrl.replace(/\/+$/, "");
};

const isLikelyLocalOrigin = (value: string) => {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local")
    );
  } catch {
    return true;
  }
};

const resolveStorefrontUrlFromCors = (storeCors: string | null | undefined) => {
  if (!storeCors) {
    return undefined;
  }

  const candidates = storeCors
    .split(",")
    .map((entry) => normalizeStorefrontUrl(entry))
    .filter((entry): entry is string => Boolean(entry));

  if (!candidates.length) {
    return undefined;
  }

  for (const candidate of candidates) {
    if (!isLikelyLocalOrigin(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
};

export const resolveStorefrontBaseUrl = (
  feedStorefrontUrl: string | null | undefined,
  configStorefrontUrl: string | null | undefined,
  envStorefrontUrl: string | null | undefined,
  storeCors: string | null | undefined
) => {
  const fromFeedEnv = normalizeStorefrontUrl(feedStorefrontUrl);
  if (fromFeedEnv) {
    return fromFeedEnv;
  }

  const fromConfig = normalizeStorefrontUrl(configStorefrontUrl);
  if (fromConfig) {
    return fromConfig;
  }

  const fromStoreCors = resolveStorefrontUrlFromCors(storeCors);
  if (fromStoreCors) {
    return fromStoreCors;
  }

  const fromEnv = normalizeStorefrontUrl(envStorefrontUrl);
  if (fromEnv) {
    return fromEnv;
  }

  return undefined;
};

export const resolveFeedImageUrl = (
  rawImageUrl: string | null | undefined,
  storefrontBaseUrl: string
) => {
  return toAbsoluteUrl(rawImageUrl, storefrontBaseUrl);
};

const isLikelyLabelImageUrl = (url: string | undefined) => {
  if (!url) {
    return false;
  }

  const normalized = url.toLowerCase();
  return LABEL_IMAGE_HINTS.some((hint) => normalized.includes(hint));
};

export const resolvePrimaryImageLink = (input: {
  thumbnail?: string | null;
  images?: ProductImage[] | null;
  storefrontBaseUrl: string;
}) => {
  const thumbnailUrl = resolveFeedImageUrl(
    input.thumbnail,
    input.storefrontBaseUrl
  );

  if (thumbnailUrl && !isLikelyLabelImageUrl(thumbnailUrl)) {
    return thumbnailUrl;
  }

  if (Array.isArray(input.images)) {
    for (const image of input.images) {
      const imageUrl = resolveFeedImageUrl(image?.url, input.storefrontBaseUrl);
      if (!imageUrl || isLikelyLabelImageUrl(imageUrl)) {
        continue;
      }

      return imageUrl;
    }
  }

  if (thumbnailUrl) {
    return thumbnailUrl;
  }

  if (Array.isArray(input.images)) {
    for (const image of input.images) {
      const imageUrl = resolveFeedImageUrl(image?.url, input.storefrontBaseUrl);
      if (imageUrl) {
        return imageUrl;
      }
    }
  }

  return undefined;
};

export const resolveAdditionalImageLink = (
  images: ProductImage[] | null | undefined,
  primaryImageUrl: string | undefined,
  storefrontBaseUrl: string
) => {
  if (!Array.isArray(images)) {
    return undefined;
  }

  for (const image of images) {
    const normalized = resolveFeedImageUrl(image?.url, storefrontBaseUrl);

    if (!normalized || isLikelyLabelImageUrl(normalized)) {
      continue;
    }

    if (primaryImageUrl && normalized === primaryImageUrl) {
      continue;
    }

    return normalized;
  }

  return undefined;
};

const loadLocalizationsByProductId = async (
  query: {
    graph: <T = Record<string, unknown>>(
      queryConfig: Record<string, unknown>
    ) => Promise<{
      data: T[]
      metadata?: { count?: number }
    }>
  },
  productIds: string[]
) => {
  const localizationByProductId = new Map<string, QueryProductLocalization>()
  if (!productIds.length) {
    return localizationByProductId
  }

  try {
    const { data } = await query.graph<QueryProductLocalization>({
      entity: "product_localization",
      fields: [
        "id",
        "product_id",
        "title_hu",
        "title_sk",
        "description_hu",
        "description_sk",
      ],
      filters: {
        product_id: productIds,
      },
      pagination: {
        take: productIds.length,
        skip: 0,
      },
    })

    for (const row of data) {
      const productId = normalizeText(row?.product_id)
      if (!productId) {
        continue
      }

      localizationByProductId.set(productId, row)
    }
  } catch {
    return localizationByProductId
  }

  return localizationByProductId
}

export const getProductFeedItemsStep = createStep(
  "get-product-feed-items",
  async (input: StepInput, { container }) => {
    const feedItems: FeedItem[] = [];
    const query = container.resolve("query") as Parameters<
      typeof getVariantAvailability
    >[0] & {
      graph: <T = Record<string, unknown>>(
        queryConfig: Record<string, unknown>
      ) => Promise<{
        data: T[]
        metadata?: { count?: number }
      }>
    };
    const configModule = container.resolve("configModule") as {
      admin?: {
        storefrontUrl?: string | null;
      };
    };

    const storefrontBaseUrl = resolveStorefrontBaseUrl(
      process.env.PRODUCT_FEED_STOREFRONT_URL,
      configModule.admin?.storefrontUrl,
      process.env.STOREFRONT_URL,
      process.env.STORE_CORS
    );

    if (!storefrontBaseUrl) {
      throw new Error(
        "Product feed requires an absolute storefront URL. Set PRODUCT_FEED_STOREFRONT_URL, admin.storefrontUrl, STOREFRONT_URL, or STORE_CORS."
      );
    }
    const storefrontLinkBaseUrl = resolveStorefrontLinkBaseUrl(
      process.env.PRODUCT_FEED_LINK_BASE_URL,
      storefrontBaseUrl
    );
    const shippingCountryCodes = resolveFeedShippingCountryCodes(
      process.env.PRODUCT_FEED_SHIPPING_COUNTRIES
    );

    const limit = 100;
    let offset = 0;
    let count = 0;

    const countryCode = input.country_code.toLowerCase();
    const currencyCode = input.currency_code.toLowerCase();

    do {
      const { data: products, metadata } = await query.graph<QueryProduct>({
        entity: "product",
        fields: [
          "id",
          "title",
          "description",
          "metadata",
          "handle",
          "thumbnail",
          "images.*",
          "status",
          "variants.*",
          "variants.calculated_price.*",
          "sales_channels.*",
          "sales_channels.stock_locations.*",
          "sales_channels.stock_locations.address.*",
        ],
        filters: {
          status: "published",
        },
        context: {
          variants: {
            calculated_price: QueryContext({
              currency_code: currencyCode,
            }),
          },
        },
        pagination: {
          take: limit,
          skip: offset,
        },
      });

      count = metadata?.count ?? 0;
      offset += limit;

      const localizationByProductId = await loadLocalizationsByProductId(
        query,
        products.map((product) => product.id)
      )

      for (const product of products) {
        const variants = readProductVariants(product);
        if (!variants.length) {
          continue;
        }

        const salesChannels = readSalesChannels(product);
        let salesChannel: Exclude<QuerySalesChannel, null> | undefined;
        for (const channel of salesChannels) {
          const stockLocations = Array.isArray(channel.stock_locations)
            ? channel.stock_locations
            : [];

          let matchesCountry = false;
          for (const location of stockLocations) {
            const locationCountryCode = location?.address?.country_code?.toLowerCase();
            if (locationCountryCode === countryCode) {
              matchesCountry = true;
              break;
            }
          }

          if (matchesCountry) {
            salesChannel = channel;
            break;
          }
        }

        const availability = salesChannel?.id
          ? await getVariantAvailability(
              query,
              {
                variant_ids: variants.map((variant) => variant.id),
                sales_channel_id: salesChannel.id,
              }
            )
          : undefined;

        const fallbackAvailability = !salesChannel?.id
          ? await getTotalVariantAvailability(query, {
              variant_ids: variants.map((variant) => variant.id),
            })
          : undefined;

        const productHandle =
          typeof product.handle === "string" && product.handle.trim().length
            ? product.handle.trim()
            : product.id;

        const productLink = `${storefrontLinkBaseUrl}/${encodeURIComponent(countryCode)}/${encodeURIComponent(productHandle)}`;

        const primaryImageLink = resolvePrimaryImageLink({
          thumbnail: product.thumbnail,
          images: product.images,
          storefrontBaseUrl,
        });

        const additionalImageLink = resolveAdditionalImageLink(
          product.images,
          primaryImageLink,
          storefrontBaseUrl
        );
        const localization = localizationByProductId.get(product.id)
        const localizedTitle = resolveLocalizedFeedTitle(
          product,
          countryCode,
          localization
        );
        const normalizedTitle = normalizeGoogleFeedTitle(localizedTitle);
        const localizedDescription = resolveLocalizedFeedDescription(
          product,
          countryCode,
          localization
        );

        for (const variant of variants) {
          const calculatedPrice = (
            variant as { calculated_price?: CalculatedPriceSet | null }
          ).calculated_price;

          if (!calculatedPrice) {
            continue;
          }

          const hasOriginalPrice =
            typeof calculatedPrice.original_amount === "number";
          const originalPrice = hasOriginalPrice
            ? calculatedPrice.original_amount
            : calculatedPrice.calculated_amount;
          const salePrice =
            hasOriginalPrice &&
            typeof calculatedPrice.calculated_amount === "number" &&
            calculatedPrice.original_amount !== calculatedPrice.calculated_amount
              ? calculatedPrice.calculated_amount
              : undefined;

          if (typeof originalPrice !== "number") {
            continue;
          }

          const availabilityQuantity = salesChannel?.id
            ? availability?.[variant.id]?.availability
            : fallbackAvailability?.[variant.id]?.availability;

          const stock = resolveFeedStock({
            manageInventory: variant.manage_inventory,
            allowBackorder: variant.allow_backorder,
            quantity: availabilityQuantity,
          });
          const brand = resolveFeedBrand({
            product,
            variant,
            localizedTitle,
            localizedDescription,
          });
          const googleProductCategory = resolveFeedGoogleProductCategory({
            productMetadata: product.metadata,
            variantMetadata: variant.metadata,
          });
          const size = resolveFeedSize({
            localizedTitle,
            productMetadata: product.metadata,
            variantMetadata: variant.metadata,
          });
          const sizeChart = resolveFeedSizeChart({
            storefrontBaseUrl,
            productMetadata: product.metadata,
            variantMetadata: variant.metadata,
          });
          const shippingWeight = resolveFeedShippingWeight({
            variantWeight: variant.weight,
            productMetadata: product.metadata,
            variantMetadata: variant.metadata,
          });
          const availabilityDate = resolveFeedAvailabilityDate({
            availability: stock.status,
            productMetadata: product.metadata,
            variantMetadata: variant.metadata,
          });
          const certification = resolveFeedCertification({
            productMetadata: product.metadata,
            variantMetadata: variant.metadata,
          });
          const shipping = resolveFeedShippingEntries({
            countryCode,
            currencyCode,
            shippingCountryCodes,
            productMetadata: product.metadata,
            variantMetadata: variant.metadata,
          });

          feedItems.push({
            id: variant.id,
            title: normalizedTitle,
            description: localizedDescription,
            link: productLink,
            image_link: primaryImageLink,
            additional_image_link: additionalImageLink,
            availability: stock.status,
            availability_date: availabilityDate,
            quantity: stock.quantity,
            price: formatPrice(originalPrice, currencyCode),
            sale_price:
              typeof salePrice === "number"
                ? formatPrice(salePrice, currencyCode)
                : undefined,
            google_product_category: googleProductCategory,
            size,
            size_chart: sizeChart,
            shipping_weight: shippingWeight,
            certification,
            shipping,
            item_group_id: product.id,
            condition: "new",
            brand,
          });
        }
      }
    } while (count > offset);

    return new StepResponse({
      items: feedItems,
    });
  }
);
