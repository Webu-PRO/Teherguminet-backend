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

type ResendOptions = {
  api_key: string
  from: string
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
}

type TemplateRenderer = (props: unknown) => ReactElement

const templates: Partial<Record<Templates, TemplateRenderer>> = {
  [Templates.ORDER_PLACED]: (props) =>
    OrderPlacedEmailComponent(props as OrderPlacedEmailProps),
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

  getTemplateSubject(template: Templates) {
    if (this.options.html_templates?.[template]?.subject) {
      return this.options.html_templates[template].subject
    }

    switch (template) {
      case Templates.ORDER_PLACED:
        return "Order Confirmation"
      default:
        return "New Email"
    }
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const template = this.getTemplate(notification.template as Templates)

    if (!template) {
      this.logger.error(
        `Couldn't find an email template for ${notification.template}. The valid options are ${Object.values(
          Templates
        )}`
      )
      return {}
    }

    const commonOptions = {
      from: this.options.from,
      to: [notification.to],
      subject: this.getTemplateSubject(notification.template as Templates),
    }

    let emailOptions: CreateEmailOptions

    if (typeof template === "string") {
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
