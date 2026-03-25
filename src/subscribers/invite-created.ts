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
import { resolveInviteLanguage } from "../modules/resend/invite-language"

type InviteEventPayload = {
  id: string
  token?: string | null
  user_email?: string | null
  email?: string | null
  expires_at?: string | Date | null
  language?: string | null
  locale?: string | null
  lang?: string | null
  country_code?: string | null
  countryCode?: string | null
}

type InviteRecord = {
  id: string
  email: string
  token: string
  expiresAt?: Date
  language: "hu" | "sk"
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
  process.env.INVITE_EMAIL_STORE_NAME ?? "Teherguminet.hu"

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
    "https://admin.teherguminet.hu"

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
    const inviteMetadata = ((details as any)?.metadata ?? {}) as Record<
      string,
      unknown
    >
    const language = resolveInviteLanguage({
      email,
      language: entry.language ?? (details as any)?.language,
      locale: entry.locale ?? (details as any)?.locale,
      lang: entry.lang ?? (details as any)?.lang,
      countryCode:
        entry.countryCode ??
        entry.country_code ??
        (details as any)?.countryCode ??
        (details as any)?.country_code,
      currencyCode:
        (details as any)?.currencyCode ?? (details as any)?.currency_code,
      metadata: inviteMetadata,
    })

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
      language,
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
    const isSk = invite.language === "sk"
    const fallbackSubject = isSk
      ? `Pozvánka do ${storeName}`
      : `Meghívó a ${storeName} platformra`

    const textSections = isSk
      ? [
          `Boli ste pozvaný na platformu ${storeName}.`,
          `Prijať pozvánku: ${inviteLink}`,
          `Token pozvánky: ${invite.token}`,
        ]
      : [
          `Meghívót kaptál a(z) ${storeName} platformra.`,
          `Meghívó elfogadása: ${inviteLink}`,
          `Meghívó token: ${invite.token}`,
        ]

    if (expiresAtFormatted) {
      textSections.push(
        isSk
          ? `Platnosť pozvánky vyprší: ${expiresAtFormatted}.`
          : `A meghívó érvényessége lejár: ${expiresAtFormatted}.`
      )
    }

    const htmlSections = isSk
      ? [
          "<p>Ahoj,</p>",
          `<p>Boli ste pozvaný na platformu ${storeName}. Kliknite na odkaz nižšie pre prijatie pozvánky:</p>`,
          `<p><a href="${inviteLink}" target="_blank" rel="noopener noreferrer">Prijať pozvánku</a></p>`,
          "<p>Ak odkaz nefunguje, skopírujte túto URL adresu do prehliadača:</p>",
          `<p><a href="${inviteLink}" target="_blank" rel="noopener noreferrer">${inviteLink}</a></p>`,
          `<p>Token pozvánky: <strong>${invite.token}</strong></p>`,
        ]
      : [
          "<p>Szia,</p>",
          `<p>Meghívót kaptál a(z) ${storeName} platformra. Kattints az alábbi linkre a meghívás elfogadásához:</p>`,
          `<p><a href="${inviteLink}" target="_blank" rel="noopener noreferrer">Meghívás elfogadása</a></p>`,
          "<p>Ha a link nem működik, másold be ezt az URL-t a böngésződbe:</p>",
          `<p><a href="${inviteLink}" target="_blank" rel="noopener noreferrer">${inviteLink}</a></p>`,
          `<p>Meghívó token: <strong>${invite.token}</strong></p>`,
        ]

    if (expiresAtFormatted) {
      htmlSections.push(
        isSk
          ? `<p>Platnosť pozvánky vyprší: ${expiresAtFormatted}.</p>`
          : `<p>A meghívó érvényessége lejár: ${expiresAtFormatted}.</p>`
      )
    }

    htmlSections.push(isSk ? "<p>Tešíme sa na vás!</p>" : "<p>Várunk szeretettel!</p>")

    return {
      to: invite.email,
      channel: "email",
      template: "user-invited",
      data: {
        email: invite.email,
        invite_link: inviteLink,
        invite_url: inviteLink,
        language: invite.language,
        locale: invite.language,
        lang: invite.language,
        token: invite.token,
        encoded_token: encodedToken,
        expires_at: invite.expiresAt
          ? invite.expiresAt.toISOString()
          : null,
      },
      content: {
        subject: fallbackSubject,
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
