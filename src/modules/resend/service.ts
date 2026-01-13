import type { ReactElement } from "react"
import { Resend } from "resend"
import type { CreateEmailOptions } from "resend"
import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import {
  OrderPlacedEmailComponent,
  type OrderPlacedEmailProps,
} from "./emails/order-placed"
import {
  OrderThanksEmailComponent,
  type OrderThanksEmailProps,
} from "./emails/order-thanks"
import {
  PaymentReceiptEmail,
  type PaymentReceiptEmailProps,
} from "./emails/payment-receipt"
import {
  userInvitedEmail,
  type UserInvitedEmailProps,
} from "./emails/user-invited"
import {
  AbandonedCartEmail,
  type AbandonedCartEmailProps,
} from "./emails/abandoned-cart"
import {
  PasswordResetEmail,
  type PasswordResetEmailProps,
} from "./emails/password-reset"
import {
  LanguageCode,
  resolveLanguageFromHints,
  resolveLanguageFromOrder,
} from "./email-language"

type ResendOptions = {
  api_key: string
  from: string
  from_name?: string
  reply_to?: string
  html_templates?: Record<
    string,
    {
      subject?: string
      content: string
    }
  >
}

type InjectedDependencies = {
  logger: Logger
}

enum Templates {
  ORDER_PLACED = "order-placed",
  ORDER_THANKS = "order-thanks",
  PAYMENT_RECEIPT = "payment-receipt",
  USER_INVITED = "user-invited",
  ABANDONED_CART = "abandoned-cart",
  PASSWORD_RESET = "password-reset",
}

type TemplateRenderer = (props: unknown) => ReactElement

const templates: Partial<Record<Templates, TemplateRenderer>> = {
  [Templates.ORDER_PLACED]: (props) =>
    OrderPlacedEmailComponent(props as OrderPlacedEmailProps),
  [Templates.ORDER_THANKS]: (props) =>
    OrderThanksEmailComponent(props as OrderThanksEmailProps),
  [Templates.PAYMENT_RECEIPT]: (props) =>
    PaymentReceiptEmail(props as PaymentReceiptEmailProps),
  [Templates.USER_INVITED]: (props) =>
    userInvitedEmail(props as UserInvitedEmailProps),
  [Templates.ABANDONED_CART]: (props) =>
    AbandonedCartEmail(props as AbandonedCartEmailProps),
  [Templates.PASSWORD_RESET]: (props) =>
    PasswordResetEmail(props as PasswordResetEmailProps),
}

const BRAND_NAME = "Tehergumi.net"

const resolveOrderReference = (data: unknown): string | null => {
  const order = (data as any)?.order ?? data

  if (!order) {
    return null
  }

  const rawId = order.display_id ?? order.id
  if (typeof rawId === "number") {
    return rawId.toString()
  }

  if (typeof rawId === "string" && rawId.trim().length) {
    return rawId.trim()
  }

  return null
}

const formatFrom = (from: string, brandName: string, customName?: string) => {
  const trimmed = from.trim()

  if (trimmed.includes("<") && trimmed.includes(">")) {
    return trimmed
  }

  const name = customName?.trim() || brandName
  return `${name} <${trimmed}>`
}

const resolveNotificationLanguage = (
  notification: ProviderSendNotificationDTO
): LanguageCode => {
  const template = notification.template as Templates
  const data = notification.data as any

  if (template === Templates.ORDER_PLACED || template === Templates.ORDER_THANKS) {
    return resolveLanguageFromOrder(data?.order ?? data)
  }

  if (template === Templates.PAYMENT_RECEIPT) {
    return resolveLanguageFromOrder(data?.order)
  }

  if (template === Templates.ABANDONED_CART) {
    return resolveLanguageFromHints({
      locale: data?.locale,
      language: data?.language,
      lang: data?.lang,
      countryCode: data?.countryCode,
      currencyCode: data?.currencyCode,
    })
  }

  return "hu"
}

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-resend"

  private readonly resendClient: Resend
  private readonly options: ResendOptions
  private readonly logger: Logger

  constructor(
    { logger }: InjectedDependencies,
    options: ResendOptions
  ) {
    super()

    ResendNotificationProviderService.validateOptions(options)

    this.resendClient = new Resend(options.api_key)
    this.options = options
    this.logger = logger
  }

  static validateOptions(options: Record<string, unknown>) {
    if (!options.api_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `api_key` is required in the provider's options."
      )
    }

    if (!options.from) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `from` is required in the provider's options."
      )
    }
  }

  getIdentifier(): string {
    return ResendNotificationProviderService.identifier
  }

  getSupportedChannels(): string[] {
    return ["email"]
  }

  getTemplate(template: Templates) {
    if (this.options.html_templates?.[template]) {
      return this.options.html_templates[template].content
    }

    const allowedTemplates = Object.keys(templates)

    if (!allowedTemplates.includes(template)) {
      return null
    }

    return templates[template]
  }

  getTemplateSubject(notification: ProviderSendNotificationDTO) {
    const template = notification.template as Templates
    const language = resolveNotificationLanguage(notification)

    if (this.options.html_templates?.[template]?.subject) {
      return this.options.html_templates[template].subject
    }

    switch (template) {
      case Templates.PAYMENT_RECEIPT: {
        const orderRef = resolveOrderReference((notification.data as any)?.order)
        if (language === "sk") {
          return orderRef
            ? `Potvrdenie platby k objednávke #${orderRef} – ${BRAND_NAME}`
            : `Potvrdenie platby – ${BRAND_NAME}`
        }

        return orderRef
          ? `Fizetési bizonylat a #${orderRef} rendeléshez – ${BRAND_NAME}`
          : `Fizetési bizonylat – ${BRAND_NAME}`
      }
      case Templates.ORDER_PLACED: {
        const orderRef = resolveOrderReference(notification.data)
        if (language === "sk") {
          return orderRef
            ? `Objednávka #${orderRef} potvrdená – ${BRAND_NAME}`
            : `Objednávka potvrdená – ${BRAND_NAME}`
        }

        return orderRef
          ? `Rendelés #${orderRef} visszaigazolva – ${BRAND_NAME}`
          : `Rendelés visszaigazolva – ${BRAND_NAME}`
      }
      case Templates.ORDER_THANKS: {
        const orderRef = resolveOrderReference((notification.data as any)?.order)
        if (language === "sk") {
          return orderRef
            ? `Ďakujeme za objednávku #${orderRef} – ${BRAND_NAME}`
            : `Ďakujeme za objednávku – ${BRAND_NAME}`
        }

        return orderRef
          ? `Köszönjük a rendelésed #${orderRef} – ${BRAND_NAME}`
          : `Köszönjük a rendelésed – ${BRAND_NAME}`
      }
      case Templates.USER_INVITED: {
        const email = (notification.data as any)?.email ?? notification.to
        return email
          ? `You're invited to ${BRAND_NAME} – ${email}`
          : `You're invited to ${BRAND_NAME}`
      }
      case Templates.ABANDONED_CART:
        return language === "sk"
          ? `Váš košík ešte čaká – ${BRAND_NAME}`
          : `A kosarad még vár rád – ${BRAND_NAME}`
      case Templates.PASSWORD_RESET:
        return `Reset your password – ${BRAND_NAME}`
      default:
        return `New message from ${BRAND_NAME}`
    }
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const subject =
      notification.content?.subject ??
      this.getTemplateSubject(notification)
    const template = this.getTemplate(notification.template as Templates)
    const commonOptions = {
      from: formatFrom(
        this.options.from,
        BRAND_NAME,
        this.options.from_name
      ),
      to: [notification.to],
      subject,
      ...(this.options.reply_to
        ? { reply_to: this.options.reply_to }
        : {}),
    }

    let emailOptions: CreateEmailOptions

    if (!template) {
      const html = notification.content?.html
      const text = notification.content?.text
      const hasRawContent = Boolean(html) || Boolean(text)

      if (hasRawContent) {
        emailOptions = {
          ...commonOptions,
          ...(html ? { html } : {}),
          // Ensure at least one render key is present for Resend typings
          text: text ?? html ?? "",
        }
      } else {
        this.logger.error(
          `Couldn't find an email template for ${notification.template}. The valid options are ${Object.values(
            Templates
          )}`
        )
        return {}
      }
    } else if (typeof template === "string") {
      emailOptions = {
        ...commonOptions,
        html: template,
      }
    } else {
      emailOptions = {
        ...commonOptions,
        react: template(notification.data),
      }
    }

    const { data, error } = await this.resendClient.emails.send(emailOptions)

    if (error || !data) {
      if (error) {
        this.logger.error("Failed to send email", error as Error)
      } else {
        this.logger.error("Failed to send email: unknown error")
      }

      return {}
    }

    return { id: data.id }
  }
}

export default ResendNotificationProviderService
