import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type {
  CreateNotificationDTO,
  INotificationModuleService,
  IUserModuleService,
  InviteDTO,
  Logger,
} from "@medusajs/types"

import { dispatchNotificationsIndividually } from "../lib/dispatch-notifications"

type InviteEventPayload = {
  id: string
  token?: string | null
  user_email?: string | null
  email?: string | null
  expires_at?: string | Date | null
}

type InviteRecord = {
  id: string
  email: string
  token: string
  expiresAt?: Date
}

const parseDate = (value?: Date | string | null): Date | undefined => {
  if (!value) {
    return undefined
  }

  if (value instanceof Date) {
    return value
  }

  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate
}

const formatExpiry = (value?: Date): string | null => {
  if (!value) {
    return null
  }

  return value.toUTCString()
}

const resolveStoreName = (): string =>
  process.env.INVITE_EMAIL_STORE_NAME ?? "Tehergumi.net"

const resolveInviteLink = (token: string): string => {
  const encodedToken = encodeURIComponent(token)
  const template = process.env.INVITE_EMAIL_URL_TEMPLATE

  if (template?.length) {
    return template
      .replace(/{{\s*encoded_token\s*}}/gi, encodedToken)
      .replace(/{{\s*token\s*}}/gi, encodedToken)
      .replace(/{{\s*raw_token\s*}}/gi, token)
  }

  const baseUrl =
    process.env.ADMIN_INVITE_BASE_URL ??
    process.env.ADMIN_FRONTEND_URL ??
    process.env.ADMIN_DASHBOARD_URL ??
    process.env.MEDUSA_ADMIN_URL ??
    process.env.ADMIN_URL ??
    "https://admin.tehergumi.net"

  const normalizedBase = baseUrl.replace(/\/$/, "")
  const path = (process.env.ADMIN_INVITE_PATH ?? "/app/invite").trim()
  const normalizedPath = path
    ? path.startsWith("/")
      ? path
      : `/${path}`
    : ""
  const tokenQueryKey =
    process.env.ADMIN_INVITE_TOKEN_QUERY_KEY?.trim() || "token"

  return `${normalizedBase}${normalizedPath}?${tokenQueryKey}=${encodedToken}`
}

const logInfo = (logger: Logger | undefined, message: string): void => {
  if (logger) {
    logger.info(message)
  } else {
    console.info(message)
  }
}

const logWarn = (
  logger: Logger | undefined,
  message: string,
  error?: unknown
): void => {
  if (logger) {
    logger.warn(message)
  } else {
    console.warn(message, error)
  }
}

const logError = (
  logger: Logger | undefined,
  message: string,
  error: unknown
): void => {
  if (logger) {
    const asError = error instanceof Error ? error : new Error(String(error))
    logger.error(message, asError)
  } else {
    console.error(message, error)
  }
}

export default async function inviteCreatedHandler({
  event,
  container,
}: SubscriberArgs<InviteEventPayload | InviteEventPayload[]>) {
  const payload = event?.data
  const inviteEvents = Array.isArray(payload)
    ? payload
    : payload
      ? [payload]
      : []

  if (!inviteEvents.length) {
    return
  }

  const inviteIds = Array.from(
    new Set(
      inviteEvents
        .map((invite) => invite?.id)
        .filter((id): id is string => typeof id === "string" && !!id)
    )
  )

  if (!inviteIds.length) {
    return
  }

  let logger: Logger | undefined
  try {
    logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  } catch {
    logger = undefined
  }

  let userModuleService: IUserModuleService
  try {
    userModuleService = container.resolve<IUserModuleService>(Modules.USER)
  } catch (error) {
    logWarn(
      logger,
      "invite-created subscriber: user module is not available",
      error
    )
    return
  }

  let notificationModuleService: INotificationModuleService
  try {
    notificationModuleService = container.resolve<INotificationModuleService>(
      Modules.NOTIFICATION
    )
  } catch (error) {
    logWarn(
      logger,
      "invite-created subscriber: notification module is not available",
      error
    )
    return
  }

  let detailedInvites: InviteDTO[] = []
  try {
    detailedInvites = await userModuleService.listInvites({
      id: inviteIds,
    })
  } catch (error) {
    logError(
      logger,
      "invite-created subscriber: failed to load invite details",
      error
    )
    return
  }

  const inviteById = new Map<string, InviteDTO>(
    detailedInvites.map((invite) => [invite.id, invite])
  )

  const invites: InviteRecord[] = []

  for (const entry of inviteEvents) {
    if (!entry?.id) {
      continue
    }

    const details = inviteById.get(entry.id)
    const email =
      entry.user_email ??
      entry.email ??
      details?.email ??
      undefined
    const token = entry.token ?? details?.token ?? undefined
    const expiresAt = parseDate(details?.expires_at ?? entry.expires_at)

    if (!email || !token) {
      logWarn(
        logger,
        `invite-created subscriber: skipping invite ${entry.id} because email or token is missing`
      )
      continue
    }

    invites.push({
      id: entry.id,
      email,
      token,
      expiresAt,
    })
  }

  if (!invites.length) {
    return
  }

  const storeName = resolveStoreName()

  const notifications: CreateNotificationDTO[] = invites.map((invite) => {
    const inviteLink = resolveInviteLink(invite.token)
    const expiresAtFormatted = formatExpiry(invite.expiresAt)
    const encodedToken = encodeURIComponent(invite.token)

    const textSections = [
      `You've been invited to join ${storeName}.`,
      `Accept your invitation: ${inviteLink}`,
      `Invitation token: ${invite.token}`,
    ]

    if (expiresAtFormatted) {
      textSections.push(`This invitation expires on ${expiresAtFormatted}.`)
    }

    const htmlSections = [
      "<p>Hello,</p>",
      `<p>You've been invited to join ${storeName}. Click the link below to accept your invitation:</p>`,
      `<p><a href="${inviteLink}" target="_blank" rel="noopener noreferrer">Accept invitation</a></p>`,
      "<p>If the link doesn't work, copy and paste this URL into your browser:</p>",
      `<p><a href="${inviteLink}" target="_blank" rel="noopener noreferrer">${inviteLink}</a></p>`,
      `<p>Your invitation token: <strong>${invite.token}</strong></p>`,
    ]

    if (expiresAtFormatted) {
      htmlSections.push(
        `<p>This invitation expires on ${expiresAtFormatted}.</p>`
      )
    }

    htmlSections.push("<p>See you soon!</p>")

    return {
      to: invite.email,
      channel: "email",
      template: "user-invited",
      data: {
        email: invite.email,
        invite_link: inviteLink,
        invite_url: inviteLink,
        token: invite.token,
        encoded_token: encodedToken,
        expires_at: invite.expiresAt
          ? invite.expiresAt.toISOString()
          : null,
      },
      content: {
        subject: `You're invited to ${storeName}`,
        html: htmlSections.join(""),
        text: textSections.join("\n\n"),
      },
      trigger_type: event.name,
      resource_id: invite.id,
      resource_type: "invite",
    }
  })

  try {
    await dispatchNotificationsIndividually(
      notificationModuleService,
      notifications,
      logger
    )
    logInfo(
      logger,
      `invite-created subscriber: sent ${notifications.length} invitation email(s)`
    )
  } catch (error) {
    logError(
      logger,
      "invite-created subscriber: failed to send invitation notification(s)",
      error
    )
  }
}

export const config: SubscriberConfig = {
  event: ["invite.created", "invite.resent"],
  context: {
    subscriberId: "invite-created-handler",
  },
}
