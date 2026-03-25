import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import type {
  CreateNotificationDTO,
  INotificationModuleService,
  Logger,
} from "@medusajs/framework/types"

import { dispatchNotificationsIndividually } from "../../lib/dispatch-notifications"

export const sendNotificationStep = createStep(
  "send-notification",
  async (
    data: CreateNotificationDTO | CreateNotificationDTO[],
    { container }
  ) => {
    const notificationModuleService =
      container.resolve<INotificationModuleService>(Modules.NOTIFICATION)
    const payloads = Array.isArray(data) ? data : [data]

    let logger: Logger | undefined
    try {
      logger = container.resolve("logger")
    } catch {
      logger = undefined
    }

    const notifications = await dispatchNotificationsIndividually(
      notificationModuleService,
      payloads,
      logger,
      {
        // Preserve predictable send order when multiple templates are queued
        // in one step (for example order-thanks before order-placed).
        concurrency: 1,
      }
    )

    return new StepResponse(notifications)
  }
)
