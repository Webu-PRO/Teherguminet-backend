import nodemailer from "nodemailer"
import {
  AbstractNotificationProviderService,
  MedusaError,
  ModuleProvider,
  Modules,
} from "@medusajs/framework/utils"
import type {
  Logger,
  NotificationTypes,
} from "@medusajs/framework/types"

type InjectedDependencies = {
  logger: Logger
}

type HostingerSMTPProviderOptions = {
  channels: string[]
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

class HostingerSMTPNotificationService extends AbstractNotificationProviderService {
  static identifier = "hostinger-smtp"

  protected readonly logger_: Logger
  protected readonly transporter_: nodemailer.Transporter
  protected readonly options_: HostingerSMTPProviderOptions

  constructor(
    { logger }: InjectedDependencies,
    options: HostingerSMTPProviderOptions
  ) {
    super()

    HostingerSMTPNotificationService.validateOptions(options)

    this.logger_ = logger
    this.options_ = options
    this.transporter_ = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: {
        user: options.user,
        pass: options.pass,
      },
    })
  }

  static validateOptions(options: Record<string, unknown>) {
    const required = [
      "channels",
      "host",
      "port",
      "user",
      "pass",
      "from",
    ]

    for (const key of required) {
      if (!options[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Notification provider option "${key}" is required`
        )
      }
    }

    if (!Array.isArray(options.channels) || !options.channels.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Notification provider option "channels" must be a non-empty array`
      )
    }
  }

  getIdentifier(): string {
    return HostingerSMTPNotificationService.identifier
  }

  getSupportedChannels(): string[] {
    return this.options_.channels
  }

  async send(
    notification: NotificationTypes.ProviderSendNotificationDTO
  ): Promise<NotificationTypes.ProviderSendNotificationResultsDTO> {
    if (!notification?.to) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No recipient provided for the notification"
      )
    }

    const from =
      notification.from?.trim() ?? this.options_.from
    const subject =
      notification.content?.subject ||
      (typeof notification.data?.subject === "string"
        ? notification.data.subject
        : "Medusa Notification")

    const html =
      notification.content?.html ||
      (typeof notification.data?.html === "string"
        ? notification.data.html
        : undefined)

    const text =
      notification.content?.text ||
      (typeof notification.data?.text === "string"
        ? notification.data.text
        : undefined)

    const attachments = notification.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content
        ? Buffer.from(attachment.content, "base64")
        : undefined,
      contentType: attachment.content_type,
      encoding: attachment.content ? "base64" : undefined,
      contentDisposition: attachment.disposition,
      cid: attachment.cid,
    }))

    const message = {
      from,
      to: notification.to,
      subject,
      html,
      text,
      attachments,
    }

    if (!message.html && !message.text && notification.data) {
      message.text = JSON.stringify(notification.data, null, 2)
    }

    try {
      const info = await this.transporter_.sendMail(message)
      this.logger_.info(
        `Sent notification ${info.messageId} to ${notification.to}`
      )
      return { id: info.messageId }
    } catch (error) {
      this.logger_.error(
        `Failed to send notification to ${notification.to}`,
        error
      )

      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to send notification: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      )
    }
  }

  async resend(
    notification: NotificationTypes.ProviderSendNotificationDTO
  ): Promise<NotificationTypes.ProviderSendNotificationResultsDTO> {
    return this.send(notification)
  }
}

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [HostingerSMTPNotificationService],
})
