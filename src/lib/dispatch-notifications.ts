import type {
  CreateNotificationDTO,
  INotificationModuleService,
  Logger,
} from "@medusajs/framework/types"

type NotificationRecord = Awaited<
  ReturnType<INotificationModuleService["createNotifications"]>
> extends Array<infer T>
  ? T
  : CreateNotificationDTO

type DispatchOptions = {
  concurrency?: number
  failOnError?: boolean
}

type DispatchFailure = {
  error: Error
  payload: CreateNotificationDTO
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
  const failures: DispatchFailure[] = []
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
        const normalizedError =
          error instanceof Error ? error : new Error(String(error))

        const message = [
          "dispatch-notifications: failed to send notification",
          payload?.template ? `template=${payload.template}` : null,
          payload?.to ? `to=${payload.to}` : null,
        ]
          .filter(Boolean)
          .join(" ")

        logger?.warn?.(message)
        logger?.error?.(message, normalizedError)
        console.warn(message, normalizedError)

        if (options?.failOnError) {
          failures.push({ error: normalizedError, payload })
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker())
  )

  if (options?.failOnError && failures.length > 0) {
    const firstFailure = failures[0]
    const failureMessage = [
      "dispatch-notifications: one or more notifications failed",
      `failed=${failures.length}`,
      `total=${payloads.length}`,
      firstFailure.payload?.template
        ? `first_template=${firstFailure.payload.template}`
        : null,
      firstFailure.payload?.to ? `first_to=${firstFailure.payload.to}` : null,
      firstFailure.error?.message
        ? `first_error=${firstFailure.error.message}`
        : null,
    ]
      .filter(Boolean)
      .join(" ")

    throw new Error(failureMessage)
  }

  return notifications
}
