import type { LanguageCode } from "../email-language";

export type OrderAddress = {
  first_name?: string | null;
  last_name?: string | null;
  country_code?: string | null;
  [key: string]: unknown;
} | null;

export type OrderItem = {
  id?: string | null;
  title?: string | null;
  product_title?: string | null;
  quantity?: number | null;
  total?: number | null;
  unit_price?: number | null;
  [key: string]: unknown;
};

export type OrderShippingMethod = {
  id: string;
  name?: string | null;
  amount?: number | null;
  [key: string]: unknown;
};

export type OrderCustomer = {
  first_name?: string | null;
  [key: string]: unknown;
} | null;

export type OrderEmailOrder = {
  id: string;
  display_id?: number | string | null;
  email?: string | null;
  metadata?: Record<string, unknown> | null;
  currency_code?: string | null;
  total?: number | null;
  subtotal?: number | null;
  shipping_total?: number | null;
  item_total?: number | null;
  shipping_address?: OrderAddress;
  billing_address?: OrderAddress;
  items?: OrderItem[];
  shipping_methods?: OrderShippingMethod[];
  customer?: OrderCustomer;
  [key: string]: unknown;
};

export type OrderEmailProps = {
  order: OrderEmailOrder;
};

export const DEFAULT_STOREFRONT_URL = "https://teherguminet.hu";
export const CONTACT_EMAIL = "info@teherguminet.hu";
export const CONTACT_PHONE = "+36 30 204 0053";

const envOrDefault = (key: string, fallback: string) => {
  const value = process.env[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
};

export const INVOICE_COMPANY_DETAILS = {
  companyName: envOrDefault("INVOICE_COMPANY_NAME", "TT World Hungary Kft"),
  city: envOrDefault("INVOICE_COMPANY_CITY", "Bakonyszombathely"),
  street: envOrDefault("INVOICE_COMPANY_STREET", "Bem u. 36."),
  postCode: envOrDefault("INVOICE_COMPANY_POSTCODE", "2884"),
  country: envOrDefault("INVOICE_COMPANY_COUNTRY", "Magyarország"),
  taxNumber: envOrDefault("INVOICE_COMPANY_TAX_NUMBER", "32630871-2-11"),
  registryNumber: envOrDefault(
    "INVOICE_COMPANY_REGISTRY_NUMBER",
    "11-09-031179"
  ),
  euTaxNumber: envOrDefault("INVOICE_COMPANY_EU_TAX_NUMBER", "HU32630871"),
  bankAccount: envOrDefault(
    "INVOICE_COMPANY_BANK_ACCOUNT",
    "10402032-50527166-87671009"
  ),
  iban: envOrDefault(
    "INVOICE_COMPANY_IBAN",
    "HU09 1040 2032 5052 7166 8767 1009"
  ),
  bankName: envOrDefault("INVOICE_COMPANY_BANK_NAME", "K&H Bank Zrt"),
  swift: envOrDefault("INVOICE_COMPANY_SWIFT", "OKHBHUHB"),
} as const;

export const F1_RED = "#e10600";
export const PANEL_BG = "rgba(20,20,22,0.92)";
export const TEXT_LIGHT = "#F5F5F7";

export const LANGUAGE_THEMES = {
  hu: {
    cardBackground:
      "linear-gradient(135deg, rgba(225,6,0,0.32) 0%, rgba(12,12,15,0.92) 70%)",
    itemBackground: "rgba(225,6,0,0.12)",
    ctaBackground: F1_RED,
    ctaShadow: "0 10px 24px rgba(225,6,0,0.45)",
    tagColor: "rgba(246,214,214,0.9)",
  },
  sk: {
    cardBackground:
      "linear-gradient(135deg, rgba(20,120,255,0.32) 0%, rgba(12,12,15,0.92) 70%)",
    itemBackground: "rgba(32,140,255,0.12)",
    ctaBackground: F1_RED,
    ctaShadow: "0 10px 24px rgba(225,6,0,0.45)",
    tagColor: "rgba(210,232,255,0.92)",
  },
} as const;

export type LanguageTheme = (typeof LANGUAGE_THEMES)[LanguageCode];

const normalizeBaseUrl = (raw?: string | null) => {
  if (!raw) {
    return DEFAULT_STOREFRONT_URL;
  }

  const trimmed = raw.trim().replace(/therguminet\.hu/gi, "teherguminet.hu");

  if (!trimmed) {
    return DEFAULT_STOREFRONT_URL;
  }

  const hasProtocol = /^https?:\/{2}/i.test(trimmed);
  const candidate = hasProtocol ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_STOREFRONT_URL;
  }
};

export const buildOrderUrl = (
  orderId: string | null | undefined,
  languageCode: LanguageCode
) => {
  const base =
    process.env.ORDER_CONFIRMATION_URL_BASE ??
    process.env.STOREFRONT_URL ??
    DEFAULT_STOREFRONT_URL;
  const normalizedBase = normalizeBaseUrl(base);
  const localePrefix = languageCode === "sk" ? "sk" : "hu";

  if (!orderId) {
    return normalizedBase;
  }

  const sanitizedId = encodeURIComponent(orderId.trim());
  const pathname = `/${localePrefix}/account/orders/details/${sanitizedId}`;

  try {
    return new URL(pathname, normalizedBase).toString();
  } catch {
    return `${normalizedBase}${pathname}`;
  }
};

export const formatAmount = (
  value: number | null | undefined,
  currencyCode: string,
  locale: string = "hu-HU"
) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  const currency = currencyCode?.toUpperCase?.() || "EUR";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
};

export const resolveOrderId = (order: OrderEmailOrder) => {
  const displayId = order.display_id;

  if (typeof displayId === "number" && Number.isFinite(displayId)) {
    return `TG-${displayId.toString().padStart(6, "0")}`;
  }

  if (typeof displayId === "string" && displayId.trim().length > 0) {
    return displayId.trim();
  }

  return order.id || "Order";
};

export const resolveCustomerName = (order: OrderEmailOrder) =>
  order.customer?.first_name?.trim() ||
  order.shipping_address?.first_name?.trim() ||
  "Partner";

export type PreparedOrderItem = {
  key: string;
  name: string;
  quantity: number;
  price: number | null;
};

export const prepareOrderItems = (
  order: OrderEmailOrder,
  fallbackLabel: string
): PreparedOrderItem[] => {
  const items = Array.isArray(order.items) ? order.items : [];

  return items.map((item, index) => {
    const fallback = fallbackLabel.trim() || "Item";
    const name =
      item.product_title?.trim() ||
      item.title?.trim() ||
      `${fallback} ${index + 1}`;
    const quantity =
      typeof item.quantity === "number" && !Number.isNaN(item.quantity)
        ? item.quantity
        : 1;
    const priceSource =
      typeof item.total === "number"
        ? item.total
        : typeof item.unit_price === "number"
          ? item.unit_price
          : null;

    return {
      key: item.id?.toString() ?? `${name}-${index}`,
      name,
      quantity,
      price: priceSource,
    };
  });
};
