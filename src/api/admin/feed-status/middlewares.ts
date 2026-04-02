import {
  type MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

import {
  FEED_STATUS_CHANNELS,
} from "../../../lib/feed-status"

export const AdminUpdateFeedStatus = z
  .object({
    market: z.string().trim().min(1),
    channel: z.enum(FEED_STATUS_CHANNELS),
    active: z.boolean(),
  })
  .strict()

export type AdminUpdateFeedStatusType = z.infer<typeof AdminUpdateFeedStatus>

export const adminFeedStatusMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/feed-status",
    method: "PATCH",
    middlewares: [validateAndTransformBody(AdminUpdateFeedStatus)],
  },
]
