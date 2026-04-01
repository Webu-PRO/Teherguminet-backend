import {
  type MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

export const AdminGenerateDiscountCode = z.object({
  discount_code: z.string().trim().min(1),
})

export type AdminGenerateDiscountCodeType = z.infer<
  typeof AdminGenerateDiscountCode
>

export const adminDiscountCodeMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/discount-code",
    method: "POST",
    middlewares: [validateAndTransformBody(AdminGenerateDiscountCode)],
  },
]

