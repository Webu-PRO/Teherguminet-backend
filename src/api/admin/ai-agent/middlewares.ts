import {
  type MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

export const AdminTranslateHuToSk = z
  .object({
    title_hu: z.string().trim().max(500).default(""),
    description_hu: z.string().trim().max(20000).default(""),
    title_sk: z.string().trim().max(500).default(""),
    description_sk: z.string().trim().max(20000).default(""),
    overwrite: z.boolean().default(false),
  })
  .strict()

export type AdminTranslateHuToSkType = z.infer<typeof AdminTranslateHuToSk>

export const adminAiAgentMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/ai-agent/translate",
    method: "POST",
    middlewares: [validateAndTransformBody(AdminTranslateHuToSk)],
  },
]
