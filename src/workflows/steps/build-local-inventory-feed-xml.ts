import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

import { FeedItem } from "./get-product-feed-items";

type StepInput = {
  items: FeedItem[];
  country_code: string;
};

type BuildLocalInventoryFeedXmlInput = {
  items: FeedItem[];
  storeCodes: string[];
};

const LOCAL_INVENTORY_STORE_CODES_ENV = "PRODUCT_FEED_LOCAL_INVENTORY_STORE_CODES";
const LOCAL_INVENTORY_STORE_CODE_MAX_LENGTH = 64;
const LOCAL_INVENTORY_STORE_CODE_PATTERN = /^[A-Za-z0-9]+$/;

const escapeXml = (str: string) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const resolveNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const resolveCountryScopedStoreCodesEnvKey = (countryCode: string) => {
  const normalizedCountryCode = countryCode.trim().toUpperCase();
  return `${LOCAL_INVENTORY_STORE_CODES_ENV}_${normalizedCountryCode}`;
};

export const parseLocalInventoryStoreCodes = (
  rawValue: string | null | undefined
) => {
  const value = (rawValue ?? "").trim();
  if (!value) {
    return [] as string[];
  }

  const uniqueCodes = new Set<string>();
  for (const token of value.split(/[,\n\r\t;|]+/)) {
    const normalized = token.trim();
    if (!normalized.length) {
      continue;
    }
    uniqueCodes.add(normalized);
  }

  return [...uniqueCodes];
};

export const validateLocalInventoryStoreCodes = (storeCodes: string[]) => {
  for (const storeCode of storeCodes) {
    if (
      storeCode.length < 1 ||
      storeCode.length > LOCAL_INVENTORY_STORE_CODE_MAX_LENGTH
    ) {
      throw new Error(
        `Invalid local inventory store code '${storeCode}'. Google requires store_code to be 1-64 characters and match your Business Profile store code exactly (case-sensitive).`
      );
    }

    if (!LOCAL_INVENTORY_STORE_CODE_PATTERN.test(storeCode)) {
      throw new Error(
        `Invalid local inventory store code '${storeCode}'. Google requires an alphanumeric store_code that matches your Business Profile store code exactly (case-sensitive).`
      );
    }
  }
};

export const resolveLocalInventoryStoreCodes = (countryCode: string) => {
  const countryScopedEnvKey = resolveCountryScopedStoreCodesEnvKey(countryCode);
  const countryScopedCodes = parseLocalInventoryStoreCodes(
    process.env[countryScopedEnvKey]
  );

  if (countryScopedCodes.length) {
    return countryScopedCodes;
  }

  return parseLocalInventoryStoreCodes(process.env[LOCAL_INVENTORY_STORE_CODES_ENV]);
};

export const normalizeLocalInventoryAvailability = (input: {
  availability?: string | null;
  quantity?: number | null;
}) => {
  const normalizedAvailability = (input.availability ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  const quantity = resolveNumber(input.quantity);

  if (
    normalizedAvailability.includes("out of stock") ||
    normalizedAvailability.includes("backorder") ||
    normalizedAvailability.includes("preorder")
  ) {
    return "out of stock";
  }

  if (
    normalizedAvailability.includes("in stock") ||
    (typeof quantity === "number" && quantity > 0)
  ) {
    return "in stock";
  }

  return "out of stock";
};

const resolveLocalInventoryQuantity = (input: {
  availability: string;
  quantity?: number | null;
}) => {
  if (input.availability === "out of stock") {
    return 0;
  }

  const quantity = resolveNumber(input.quantity);
  if (typeof quantity === "number" && quantity > 0) {
    return Math.floor(quantity);
  }

  // Google local inventory feed expects quantity together with in stock availability.
  return 1;
};

export const buildLocalInventoryFeedXml = (
  input: BuildLocalInventoryFeedXmlInput
) => {
  const itemsXml = input.items
    .flatMap((item) => {
      return input.storeCodes.map((storeCode) => {
        const availability = normalizeLocalInventoryAvailability({
          availability: item.availability,
          quantity: item.quantity,
        });
        const quantity = resolveLocalInventoryQuantity({
          availability,
          quantity: item.quantity,
        });

        return (
          "<item>" +
          `<g:store_code>${escapeXml(storeCode)}</g:store_code>` +
          `<g:id>${escapeXml(item.id)}</g:id>` +
          `<g:availability>${escapeXml(availability)}</g:availability>` +
          `<g:quantity>${escapeXml(String(quantity))}</g:quantity>` +
          `<g:price>${escapeXml(item.price)}</g:price>` +
          "</item>"
        );
      });
    })
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">' +
    "<channel>" +
    "<title>Local Inventory Feed</title>" +
    "<description>Local inventory feed for Google Merchant</description>" +
    itemsXml +
    "</channel>" +
    "</rss>"
  );
};

export const buildLocalInventoryFeedXmlStep = createStep(
  "build-local-inventory-feed-xml",
  async (input: StepInput) => {
    const storeCodes = resolveLocalInventoryStoreCodes(input.country_code);

    if (!storeCodes.length) {
      throw new Error(
        "Local inventory feed requires store codes. Set PRODUCT_FEED_LOCAL_INVENTORY_STORE_CODES or PRODUCT_FEED_LOCAL_INVENTORY_STORE_CODES_<COUNTRY_CODE>."
      );
    }

    validateLocalInventoryStoreCodes(storeCodes);

    const xml = buildLocalInventoryFeedXml({
      items: input.items,
      storeCodes,
    });

    return new StepResponse(xml);
  }
);
