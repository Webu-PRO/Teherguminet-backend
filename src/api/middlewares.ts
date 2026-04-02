import {
  defineMiddlewares,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { adminDiscountCodeMiddlewares } from "./admin/discount-code/middlewares";
import { adminFeedStatusMiddlewares } from "./admin/feed-status/middlewares";

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
  .superRefine((value, ctx) => {
    const isValidPair =
      (value.country_code === "hu" && value.currency_code === "huf") ||
      (value.country_code === "sk" && value.currency_code === "eur");

    if (isValidPair) {
      return;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Unsupported product feed market. Supported pairs: hu+huf, sk+eur.",
      path: ["country_code"],
    });
  });

export default defineMiddlewares({
  routes: [
    {
      matcher: "/product-feed",
      methods: ["GET"],
      middlewares: [validateAndTransformQuery(productFeedQuerySchema, {})],
    },
    ...adminDiscountCodeMiddlewares,
    ...adminFeedStatusMiddlewares,
  ],
});
