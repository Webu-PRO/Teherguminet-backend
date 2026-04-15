import {
  defineMiddlewares,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { adminDiscountCodeMiddlewares } from "./admin/discount-code/middlewares";
import { adminFeedStatusMiddlewares } from "./admin/feed-status/middlewares";
import { adminSeoSettingsMiddlewares } from "./admin/seo-settings/middlewares";
import { adminProductLocalizationMiddlewares } from "./admin/products/localization/middlewares";

const productFeedQuerySchema = z
  .object({
    currency_code: z
      .string()
      .trim()
      .min(1)
      .transform((value) => value.toLowerCase()),
    country_code: z
      .string()
      .trim()
      .min(1)
      .transform((value) => value.toLowerCase()),
  })
  .strict();

export default defineMiddlewares({
  routes: [
    {
      matcher: "/product-feed",
      methods: ["GET"],
      middlewares: [validateAndTransformQuery(productFeedQuerySchema, {})],
    },
    {
      matcher: "/local-inventory-feed",
      methods: ["GET"],
      middlewares: [validateAndTransformQuery(productFeedQuerySchema, {})],
    },
    ...adminDiscountCodeMiddlewares,
    ...adminFeedStatusMiddlewares,
    ...adminSeoSettingsMiddlewares,
    ...adminProductLocalizationMiddlewares,
  ],
});
