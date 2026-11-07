import {
  defineMiddlewares,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { adminDiscountCodeMiddlewares } from "./admin/discount-code/middlewares";
import { adminFeedStatusMiddlewares } from "./admin/feed-status/middlewares";
import { adminSeoSettingsMiddlewares } from "./admin/seo-settings/middlewares";
import { adminProductLocalizationMiddlewares } from "./admin/products/localization/middlewares";
import { stripSupplierCostMiddleware } from "./store/strip-supplier-cost-middleware";

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
      // never leak supplier purchase data (Tomket cost, shipping fee, internal id) in Store API responses
      matcher: "/store/*",
      middlewares: [stripSupplierCostMiddleware],
    },
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
