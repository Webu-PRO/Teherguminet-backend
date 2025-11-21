import type {
  CreateNotificationDTO,
  INotificationModuleService,
  Logger,
} from "@medusajs/framework/types"

type NotificationRecord = Awaited<
  ReturnType<INotificationModuleService["createNotifications"]>
>[number]

type DispatchOptions = {
  concurrency?: number
}

const resolveConcurrency = (requested?: number, total = 0) => {
  if (typeof requested !== "number" || Number.isNaN(requested)) {
    return Math.min(3, Math.max(total, 1))
  }

  if (requested < 1) {
    return 1
  }

  return Math.min(requested, Math.max(total, 1))
}

export const dispatchNotificationsIndividually = async (
  notificationService: INotificationModuleService,
  payloads: CreateNotificationDTO[],
  logger?: Logger,
  options?: DispatchOptions
): Promise<NotificationRecord[]> => {
  if (!payloads.length) {
    return []
  }

  const notifications: NotificationRecord[] = []
  let index = 0

  const concurrency = resolveConcurrency(
    options?.concurrency,
    payloads.length
  )

  const worker = async () => {
    while (index < payloads.length) {
      const currentIndex = index++
      const payload = payloads[currentIndex]

      try {
        const created =
          await notificationService.createNotifications([payload])
        notifications.push(...created)
      } catch (error) {
        const message = [
          "dispatch-notifications: failed to send notification",
          payload?.template ? `template=${payload.template}` : null,
          payload?.to ? `to=${payload.to}` : null,
        ]
          .filter(Boolean)
          .join(" ")

        if (logger?.warn) {
          logger.warn(message, error as Error)
        } else {
          console.warn(message, error)
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker())
  )

  return notifications
}
