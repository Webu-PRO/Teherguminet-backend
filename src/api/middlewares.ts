import {
  defineMiddlewares,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";

export default defineMiddlewares({
  routes: [
    {
      matcher: "/product-feed",
      method: "GET",
      middlewares: [
        validateAndTransformQuery(
          z.object({
            currency_code: z.string(),
            country_code: z.string(),
          }),
          {}
        ),
      ],
    },
  ],
});
