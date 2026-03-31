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

const formatPrice = (price: number, currencyCode: string) => {
  return `${Number(price).toFixed(2)} ${currencyCode.toUpperCase()}`;
};

export const getProductFeedItemsStep = createStep(
  "get-product-feed-items",
  async (input: StepInput, { container }) => {
    const feedItems: FeedItem[] = [];
    const query = container.resolve("query");
    const configModule = container.resolve("configModule") as {
      admin?: {
        storefrontUrl?: string | null;
      };
    };

    const storefrontUrl =
      configModule.admin?.storefrontUrl || process.env.STOREFRONT_URL || "";
    const normalizedStorefrontUrl = storefrontUrl.replace(/\/+$/, "");

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
          ? await getVariantAvailability(query, {
              variant_ids: product.variants.map((variant) => variant.id),
              sales_channel_id: salesChannel.id,
            })
          : undefined;

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
            description: product.description ?? "",
            link: `${normalizedStorefrontUrl}/${input.country_code}/${product.handle || product.id}`,
            image_link: product.thumbnail ?? "",
            additional_image_link: product.images
              ?.map((image) => image.url)
              .join(","),
            availability: stockStatus,
            price: formatPrice(originalPrice as number, currencyCode),
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
