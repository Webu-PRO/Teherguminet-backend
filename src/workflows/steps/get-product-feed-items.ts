import { CalculatedPriceSet } from "@medusajs/framework/types";
import {
  getVariantAvailability,
  QueryContext,
} from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

export type FeedItem = {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link?: string;
  additional_image_link?: string;
  availability: string;
  price: string;
  sale_price?: string;
  item_group_id: string;
  condition?: string;
  brand?: string;
};

type StepInput = {
  currency_code: string;
  country_code: string;
};

type ProductImage = {
  url?: string | null;
} | null;

const ABSOLUTE_URL_PREFIX_REGEX = /^[a-z][a-z\d+\-.]*:\/\//i;
const DESCRIPTION_METADATA_KEYS = {
  hu: ["description_hu", "description_hu_hu", "leiras_hu", "leiras_hu_hu"],
  sk: ["description_sk", "description_sk_sk", "leiras_sk", "leiras_sk_sk"],
} as const;

export const formatPrice = (price: number, currencyCode: string) => {
  return `${Number(price).toFixed(2)} ${currencyCode.toUpperCase()}`;
};

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const resolveDescriptionFromMetadata = (
  metadata: Record<string, unknown> | null | undefined,
  keys: readonly string[]
) => {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  for (const key of keys) {
    const value = normalizeText(metadata[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
};

export const resolveLocalizedFeedDescription = (
  product: {
    description?: unknown;
    title?: unknown;
    metadata?: Record<string, unknown> | null;
  },
  countryCode: string
) => {
  const normalizedCountryCode = countryCode.toLowerCase();
  const metadataKeys = normalizedCountryCode.startsWith("sk")
    ? DESCRIPTION_METADATA_KEYS.sk
    : normalizedCountryCode.startsWith("hu")
      ? DESCRIPTION_METADATA_KEYS.hu
      : [];

  const localizedDescription = resolveDescriptionFromMetadata(
    product.metadata,
    metadataKeys
  );

  if (localizedDescription) {
    return localizedDescription;
  }

  const defaultDescription = normalizeText(product.description);
  if (defaultDescription) {
    return defaultDescription;
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

export const resolveStorefrontBaseUrl = (
  configStorefrontUrl: string | null | undefined,
  envStorefrontUrl: string | null | undefined
) => {
  const fromConfig = normalizeStorefrontUrl(configStorefrontUrl);
  if (fromConfig) {
    return fromConfig;
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

    if (!normalized) {
      continue;
    }

    if (primaryImageUrl && normalized === primaryImageUrl) {
      continue;
    }

    return normalized;
  }

  return undefined;
};

export const getProductFeedItemsStep = createStep(
  "get-product-feed-items",
  async (input: StepInput, { container }) => {
    const feedItems: FeedItem[] = [];
    const query = container.resolve("query") as {
      graph: (queryConfig: Record<string, unknown>) => Promise<{
        data: any[];
        metadata?: { count?: number };
      }>;
    };
    const configModule = container.resolve("configModule") as {
      admin?: {
        storefrontUrl?: string | null;
      };
    };

    const storefrontBaseUrl = resolveStorefrontBaseUrl(
      configModule.admin?.storefrontUrl,
      process.env.STOREFRONT_URL
    );

    if (!storefrontBaseUrl) {
      throw new Error(
        "Product feed requires an absolute storefront URL. Set admin.storefrontUrl or STOREFRONT_URL."
      );
    }

    const limit = 100;
    let offset = 0;
    let count = 0;

    const countryCode = input.country_code.toLowerCase();
    const currencyCode = input.currency_code.toLowerCase();

    do {
      const { data: products, metadata } = await query.graph({
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

      for (const product of products) {
        if (!product.variants?.length) {
          continue;
        }

        const salesChannel = product.sales_channels?.find((channel) => {
          return channel?.stock_locations?.some((location) => {
            const locationCountryCode =
              location?.address?.country_code?.toLowerCase();
            return locationCountryCode === countryCode;
          });
        });

        const availability = salesChannel?.id
          ? await getVariantAvailability(
              query as Parameters<typeof getVariantAvailability>[0],
              {
                variant_ids: product.variants.map((variant) => variant.id),
                sales_channel_id: salesChannel.id,
              }
            )
          : undefined;

        const productHandle =
          typeof product.handle === "string" && product.handle.trim().length
            ? product.handle.trim()
            : product.id;

        const productLink = `${storefrontBaseUrl}/${encodeURIComponent(countryCode)}/${encodeURIComponent(productHandle)}`;

        const primaryImageLink = resolveFeedImageUrl(
          product.thumbnail ?? product.images?.[0]?.url,
          storefrontBaseUrl
        );

        const additionalImageLink = resolveAdditionalImageLink(
          product.images,
          primaryImageLink,
          storefrontBaseUrl
        );

        for (const variant of product.variants) {
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

          const stockStatus = !variant.manage_inventory
            ? "in stock"
            : !availability?.[variant.id]?.availability
              ? "out of stock"
              : "in stock";

          feedItems.push({
            id: variant.id,
            title: product.title,
            description: resolveLocalizedFeedDescription(product, countryCode),
            link: productLink,
            image_link: primaryImageLink,
            additional_image_link: additionalImageLink,
            availability: stockStatus,
            price: formatPrice(originalPrice, currencyCode),
            sale_price:
              typeof salePrice === "number"
                ? formatPrice(salePrice, currencyCode)
                : undefined,
            item_group_id: product.id,
            condition: "new",
          });
        }
      }
    } while (count > offset);

    return new StepResponse({
      items: feedItems,
    });
  }
);
