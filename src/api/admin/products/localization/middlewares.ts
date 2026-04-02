import {
  type MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

export const AdminUpdateProductLocalization = z
  .object({
    title_hu: z.string().trim().max(500).optional(),
    title_sk: z.string().trim().max(500).optional(),
    description_hu: z.string().trim().max(20000).optional(),
    description_sk: z.string().trim().max(20000).optional(),
  })
  .strict()

export type AdminUpdateProductLocalizationType = z.infer<
  typeof AdminUpdateProductLocalization
>

export const adminProductLocalizationMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/products/:id/localization",
    method: "PATCH",
    middlewares: [validateAndTransformBody(AdminUpdateProductLocalization)],
  },
]

