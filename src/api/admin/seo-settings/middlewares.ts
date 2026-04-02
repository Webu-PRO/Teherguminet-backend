import {
  type MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

import {
  DEFAULT_SEO_STRUCTURED_DATA,
  DEFAULT_SEO_VIEWPORT,
  isValidAbsoluteHttpUrl,
  isValidJsonString,
} from "../../../lib/seo-settings"

const AdminSeoSocialEntry = z
  .object({
    key: z.string().trim().min(1).max(120),
    value: z.string().trim().min(1).max(500),
  })
  .strict()

const adminAbsoluteUrlField = (fieldName: string) =>
  z
    .string()
    .trim()
    .max(2048)
    .default("")
    .refine((value) => !value || isValidAbsoluteHttpUrl(value), {
      message: `${fieldName} must be an absolute HTTP(S) URL.`,
    })

export const AdminUpdateSeoSettings = z
  .object({
    metaTitle: z.string().trim().max(70).default(""),
    metaDescription: z.string().trim().max(500).default(""),
    metaImageUrl: adminAbsoluteUrlField("metaImageUrl"),
    metaSocial: z.array(AdminSeoSocialEntry).max(100).default([]),
    keywords: z.string().trim().max(1000).default(""),
    metaRobots: z.string().trim().max(255).default(""),
    structuredData: z
      .string()
      .trim()
      .max(20000)
      .default(DEFAULT_SEO_STRUCTURED_DATA)
      .refine((value) => !value || isValidJsonString(value), {
        message: "structuredData must be valid JSON.",
      }),
    viewport: z.string().trim().max(120).default(DEFAULT_SEO_VIEWPORT),
    canonicalUrl: adminAbsoluteUrlField("canonicalUrl"),
  })
  .strict()

export type AdminUpdateSeoSettingsType = z.infer<typeof AdminUpdateSeoSettings>

export const adminSeoSettingsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/seo-settings",
    method: "PATCH",
    middlewares: [validateAndTransformBody(AdminUpdateSeoSettings)],
  },
]
