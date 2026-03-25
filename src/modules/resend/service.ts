import type { ReactElement } from "react";
import { Resend } from "resend";
import type { CreateEmailOptions } from "resend";
import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils";
import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types";
import {
  OrderPlacedEmailComponent,
  type OrderPlacedEmailProps,
} from "./emails/order-placed";
import {
  OrderThanksEmailComponent,
  type OrderThanksEmailProps,
} from "./emails/order-thanks";
import {
  OrderDeliveredEmail,
  type OrderDeliveredEmailProps,
} from "./emails/order-delivered";
import {
  OrderPickupReadyEmail,
  type OrderPickupReadyEmailProps,
} from "./emails/order-pickup-ready";
import {
  OwnDeliveryPaymentNoticeEmail,
  type OwnDeliveryPaymentNoticeEmailProps,
} from "./emails/own-delivery-payment-notice";
import {
  PaymentReceiptEmail,
  type PaymentReceiptEmailProps,
} from "./emails/payment-receipt";
import {
  userInvitedEmail,
  type UserInvitedEmailProps,
} from "./emails/user-invited";
import {
  AbandonedCartEmail,
  type AbandonedCartEmailProps,
} from "./emails/abandoned-cart";
import {
  PasswordResetEmail,
  type PasswordResetEmailProps,
} from "./emails/password-reset";
import {
  GlsLabelCancelledEmail,
  type GlsLabelCancelledEmailProps,
} from "./emails/gls-label-cancelled";
import {
  GlsShipmentCreatedEmail,
  type GlsShipmentCreatedEmailProps,
} from "./emails/gls-shipment-created";
import {
  OrderItemsCancelledEmail,
  type OrderItemsCancelledEmailProps,
} from "./emails/order-items-cancelled";
import {
  LanguageCode,
  resolveLanguageFromHints,
  resolveLanguageFromOrder,
} from "./email-language";

type ResendOptions = {
  api_key: string;
  from: string;
  from_name?: string;
  reply_to?: string;
  template_ids?: Record<string, string>;
  html_templates?: Record<
    string,
    {
      subject?: string;
      content: string;
    }
  >;
};

type InjectedDependencies = {
  logger: Logger;
};

enum Templates {
  ORDER_PLACED = "order-placed",
  ORDER_THANKS = "order-thanks",
  ORDER_DELIVERED = "order-delivered",
  ORDER_PICKUP_READY = "order-pickup-ready",
  OWN_DELIVERY_PAYMENT_NOTICE = "own-delivery-payment-notice",
  PAYMENT_RECEIPT = "payment-receipt",
  USER_INVITED = "user-invited",
  ABANDONED_CART = "abandoned-cart",
  PASSWORD_RESET = "password-reset",
  GLS_LABEL_CANCELLED = "gls-label-cancelled",
  ORDER_ITEMS_CANCELLED = "order-items-cancelled",
  GLS_SHIPMENT_CREATED = "gls-shipment-created",
}

type TemplateRenderer = (props: unknown) => ReactElement;

const templates: Partial<Record<Templates, TemplateRenderer>> = {
  [Templates.ORDER_PLACED]: (props) =>
    OrderPlacedEmailComponent(props as OrderPlacedEmailProps),
  [Templates.ORDER_THANKS]: (props) =>
    OrderThanksEmailComponent(props as OrderThanksEmailProps),
  [Templates.ORDER_DELIVERED]: (props) =>
    OrderDeliveredEmail(props as OrderDeliveredEmailProps),
  [Templates.ORDER_PICKUP_READY]: (props) =>
    OrderPickupReadyEmail(props as OrderPickupReadyEmailProps),
  [Templates.OWN_DELIVERY_PAYMENT_NOTICE]: (props) =>
    OwnDeliveryPaymentNoticeEmail(props as OwnDeliveryPaymentNoticeEmailProps),
  [Templates.PAYMENT_RECEIPT]: (props) =>
    PaymentReceiptEmail(props as PaymentReceiptEmailProps),
  [Templates.USER_INVITED]: (props) =>
    userInvitedEmail(props as UserInvitedEmailProps),
  [Templates.ABANDONED_CART]: (props) =>
    AbandonedCartEmail(props as AbandonedCartEmailProps),
  [Templates.PASSWORD_RESET]: (props) =>
    PasswordResetEmail(props as PasswordResetEmailProps),
  [Templates.GLS_LABEL_CANCELLED]: (props) =>
    GlsLabelCancelledEmail(props as GlsLabelCancelledEmailProps),
  [Templates.ORDER_ITEMS_CANCELLED]: (props) =>
    OrderItemsCancelledEmail(props as OrderItemsCancelledEmailProps),
  [Templates.GLS_SHIPMENT_CREATED]: (props) =>
    GlsShipmentCreatedEmail(props as GlsShipmentCreatedEmailProps),
};

const BRAND_NAME = "Teherguminet.hu";

const resolveOrderReference = (data: unknown): string | null => {
  const order = (data as any)?.order ?? data;

  if (!order) {
    return null;
  }

  const rawId = order.display_id ?? order.id;
  if (typeof rawId === "number") {
    return rawId.toString();
  }

  if (typeof rawId === "string" && rawId.trim().length) {
    return rawId.trim();
  }

  return null;
};

const formatFrom = (from: string, brandName: string, customName?: string) => {
  const trimmed = from.trim();

  if (trimmed.includes("<") && trimmed.includes(">")) {
    return trimmed;
  }

  const name = customName?.trim() || brandName;
  return `${name} <${trimmed}>`;
};

const resolveNotificationLanguage = (
  notification: ProviderSendNotificationDTO
): LanguageCode => {
  const template = notification.template as Templates;
  const data = notification.data as any;

  const resolvePasswordResetLanguage = (): LanguageCode => {
    const hasHints = [data?.locale, data?.language, data?.lang, data?.countryCode].some(
      (value) => typeof value === "string" && value.trim().length > 0
    );

    if (hasHints) {
      return resolveLanguageFromHints({
        locale: data?.locale,
        language: data?.language,
        lang: data?.lang,
        countryCode: data?.countryCode,
      });
    }

    const resetUrl = typeof data?.reset_url === "string" ? data.reset_url.trim() : "";
    if (!resetUrl) {
      return "hu";
    }

    try {
      const url = new URL(resetUrl);
      const localeSegment =
        url.pathname.split("/").filter(Boolean)[0]?.trim().toLowerCase() ?? "";

      if (localeSegment === "hu" || localeSegment === "sk") {
        return localeSegment;
      }

      const fromUrlHints = resolveLanguageFromHints({
        locale: url.searchParams.get("locale"),
        language: url.searchParams.get("language"),
        lang: url.searchParams.get("lang"),
      });
      return fromUrlHints;
    } catch {
      return "hu";
    }
  };

  if (
    template === Templates.ORDER_PLACED ||
    template === Templates.ORDER_THANKS ||
    template === Templates.ORDER_DELIVERED ||
    template === Templates.ORDER_PICKUP_READY ||
    template === Templates.OWN_DELIVERY_PAYMENT_NOTICE ||
    template === Templates.GLS_LABEL_CANCELLED ||
    template === Templates.ORDER_ITEMS_CANCELLED ||
    template === Templates.GLS_SHIPMENT_CREATED
  ) {
    return resolveLanguageFromOrder(data?.order ?? data);
  }

  if (template === Templates.PAYMENT_RECEIPT) {
    return resolveLanguageFromOrder(data?.order);
  }

  if (template === Templates.ABANDONED_CART) {
    return resolveLanguageFromHints({
      locale: data?.locale,
      language: data?.language,
      lang: data?.lang,
      countryCode: data?.countryCode,
      currencyCode: data?.currencyCode,
    });
  }

  if (template === Templates.PASSWORD_RESET) {
    return resolvePasswordResetLanguage();
  }

  return "hu";
};

const resolveAttachments = (notification: ProviderSendNotificationDTO) => {
  const raw =
    (notification as any)?.attachments ??
    (notification.data as any)?.attachments;
  if (!Array.isArray(raw)) {
    return undefined;
  }

  type ResendAttachment = NonNullable<CreateEmailOptions["attachments"]>[number];

  const normalized = raw
    .map((entry): ResendAttachment | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const filename =
        typeof record.filename === "string" ? record.filename.trim() : "";
      const path =
        typeof record.path === "string" ? record.path.trim() : "";
      let content: string | undefined;
      if (typeof record.content === "string") {
        const trimmed = record.content.trim();
        content = trimmed || undefined;
      } else if (Buffer.isBuffer(record.content)) {
        content = record.content.toString("base64");
      }
      const contentType =
        typeof record.contentType === "string"
          ? record.contentType.trim()
          : typeof record.content_type === "string"
            ? record.content_type.trim()
            : "";
      const contentId =
        typeof record.contentId === "string"
          ? record.contentId.trim()
          : typeof record.content_id === "string"
            ? record.content_id.trim()
            : typeof record.id === "string"
              ? record.id.trim()
              : "";
      if (!filename || (!path && !content)) {
        return null;
      }

      return {
        filename,
        ...(path ? { path } : {}),
        ...(content ? { content } : {}),
        ...(contentType ? { contentType } : {}),
        ...(contentId ? { contentId } : {}),
      };
    })
    .filter((entry): entry is ResendAttachment => Boolean(entry));

  return normalized.length ? normalized : undefined;
};

const extractTemplateVariables = (
  input: unknown
): Record<string, string | number> | undefined => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const output: Record<string, string | number> = {};

  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (typeof raw === "string") {
      if (raw.trim().length) {
        output[key] = raw;
      }
      continue;
    }

    if (typeof raw === "number" && Number.isFinite(raw)) {
      output[key] = raw;
      continue;
    }

    if (typeof raw === "boolean") {
      output[key] = raw ? "true" : "false";
    }
  }

  return Object.keys(output).length ? output : undefined;
};

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-resend";

  private readonly resendClient: Resend;
  private readonly options: ResendOptions;
  private readonly logger: Logger;

  constructor({ logger }: InjectedDependencies, options: ResendOptions) {
    super();

    ResendNotificationProviderService.validateOptions(options);

    this.resendClient = new Resend(options.api_key);
    this.options = options;
    this.logger = logger;
  }

  static validateOptions(options: Record<string, unknown>) {
    if (!options.api_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `api_key` is required in the provider's options."
      );
    }

    if (!options.from) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `from` is required in the provider's options."
      );
    }
  }

  getIdentifier(): string {
    return ResendNotificationProviderService.identifier;
  }

  getSupportedChannels(): string[] {
    return ["email"];
  }

  getTemplate(template: Templates) {
    if (this.options.html_templates?.[template]) {
      return this.options.html_templates[template].content;
    }

    const allowedTemplates = Object.keys(templates);

    if (!allowedTemplates.includes(template)) {
      return null;
    }

    return templates[template];
  }

  getTemplateSubject(notification: ProviderSendNotificationDTO) {
    const template = notification.template as Templates;
    const language = resolveNotificationLanguage(notification);

    if (this.options.html_templates?.[template]?.subject) {
      return this.options.html_templates[template].subject;
    }

    switch (template) {
      case Templates.PAYMENT_RECEIPT: {
        const orderRef = resolveOrderReference(
          (notification.data as any)?.order
        );
        if (language === "sk") {
          return orderRef
            ? `Potvrdenie platby k objednávke #${orderRef} – ${BRAND_NAME}`
            : `Potvrdenie platby – ${BRAND_NAME}`;
        }

        return orderRef
          ? `Fizetési bizonylat a #${orderRef} rendeléshez – ${BRAND_NAME}`
          : `Fizetési bizonylat – ${BRAND_NAME}`;
      }
      case Templates.ORDER_PLACED: {
        const orderRef = resolveOrderReference(notification.data);
        if (language === "sk") {
          return orderRef
            ? `Objednávka #${orderRef} potvrdená – ${BRAND_NAME}`
            : `Objednávka potvrdená – ${BRAND_NAME}`;
        }

        return orderRef
          ? `Rendelés #${orderRef} visszaigazolva – ${BRAND_NAME}`
          : `Rendelés visszaigazolva – ${BRAND_NAME}`;
      }
      case Templates.ORDER_THANKS: {
        const orderRef = resolveOrderReference(
          (notification.data as any)?.order
        );
        if (language === "sk") {
          return orderRef
            ? `Ďakujeme za objednávku #${orderRef} – ${BRAND_NAME}`
            : `Ďakujeme za objednávku – ${BRAND_NAME}`;
        }

        return orderRef
          ? `Köszönjük a rendelésed #${orderRef} – ${BRAND_NAME}`
          : `Köszönjük a rendelésed – ${BRAND_NAME}`;
      }
      case Templates.ORDER_DELIVERED: {
        const orderRef = resolveOrderReference(
          (notification.data as any)?.order
        );
        if (language === "sk") {
          return orderRef
            ? `Objednávka #${orderRef} doručená – ${BRAND_NAME}`
            : `Objednávka doručená – ${BRAND_NAME}`;
        }

        return orderRef
          ? `Rendelés #${orderRef} kiszállítva – ${BRAND_NAME}`
          : `Rendelés kiszállítva – ${BRAND_NAME}`;
      }
      case Templates.ORDER_PICKUP_READY: {
        const orderRef = resolveOrderReference(
          (notification.data as any)?.order
        );
        if (language === "sk") {
          return orderRef
            ? `Objednávka #${orderRef} pripravená na osobný odber – ${BRAND_NAME}`
            : `Objednávka pripravená na osobný odber – ${BRAND_NAME}`;
        }

        return orderRef
          ? `Rendelés #${orderRef} átvehető telephelyünkön – ${BRAND_NAME}`
          : `Megrendelésed a telephelyen átvehető – ${BRAND_NAME}`;
      }
      case Templates.OWN_DELIVERY_PAYMENT_NOTICE: {
        const orderRef = resolveOrderReference(
          (notification.data as any)?.order
        );
        if (language === "sk") {
          return orderRef
            ? `Objednávka #${orderRef}: vlastné doručenie potvrdené – ${BRAND_NAME}`
            : `Vlastné doručenie potvrdené – ${BRAND_NAME}`;
        }

        return orderRef
          ? `Rendelés #${orderRef}: saját szállítás visszaigazolva – ${BRAND_NAME}`
          : `Saját szállítás visszaigazolva – ${BRAND_NAME}`;
      }
      case Templates.USER_INVITED: {
        const email = (notification.data as any)?.email ?? notification.to;
        return email
          ? `You're invited to ${BRAND_NAME} – ${email}`
          : `You're invited to ${BRAND_NAME}`;
      }
      case Templates.ABANDONED_CART:
        return language === "sk"
          ? `Váš košík ešte čaká – ${BRAND_NAME}`
          : `A kosarad még vár rád – ${BRAND_NAME}`;
      case Templates.PASSWORD_RESET:
        return language === "sk"
          ? `Obnova hesla – ${BRAND_NAME}`
          : `Jelszó visszaállítása – ${BRAND_NAME}`;
      case Templates.GLS_LABEL_CANCELLED: {
        const orderRef = resolveOrderReference(
          (notification.data as any)?.order
        );
        if (language === "sk") {
          return orderRef
            ? `GLS štítok zrušený pre objednávku #${orderRef} – ${BRAND_NAME}`
            : `GLS štítok zrušený – ${BRAND_NAME}`;
        }

        return orderRef
          ? `GLS címke törölve a #${orderRef} rendeléshez – ${BRAND_NAME}`
          : `GLS címke törölve – ${BRAND_NAME}`;
      }
      case Templates.ORDER_ITEMS_CANCELLED: {
        const orderRef = resolveOrderReference(
          (notification.data as any)?.order
        );
        if (language === "sk") {
          return orderRef
            ? `Zrušené položky v objednávke #${orderRef} – ${BRAND_NAME}`
            : `Zrušené položky v objednávke – ${BRAND_NAME}`;
        }

        return orderRef
          ? `Törölt tételek a #${orderRef} rendelésben – ${BRAND_NAME}`
          : `Törölt tételek a rendelésben – ${BRAND_NAME}`;
      }
      case Templates.GLS_SHIPMENT_CREATED: {
        const orderRef = resolveOrderReference(
          (notification.data as any)?.order
        );
        if (language === "sk") {
          return orderRef
            ? `GLS zásielka vytvorená #${orderRef} – ${BRAND_NAME}`
            : `GLS zásielka vytvorená – ${BRAND_NAME}`;
        }

        return orderRef
          ? `GLS csomag létrehozva a #${orderRef} rendeléshez – ${BRAND_NAME}`
          : `GLS csomag létrehozva – ${BRAND_NAME}`;
      }
      default:
        return `New message from ${BRAND_NAME}`;
    }
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const selectedTemplate = notification.template as Templates;
    const template = this.getTemplate(selectedTemplate);
    const language = resolveNotificationLanguage(notification);
    const configuredTemplateId =
      this.options.template_ids?.[`${selectedTemplate}.${language}`] ??
      this.options.template_ids?.[selectedTemplate];
    const commonOptions = {
      from: formatFrom(this.options.from, BRAND_NAME, this.options.from_name),
      to: [notification.to],
      ...(this.options.reply_to ? { reply_to: this.options.reply_to } : {}),
    };

    let emailOptions: CreateEmailOptions;

    if (configuredTemplateId?.trim()) {
      const variables = extractTemplateVariables(notification.data);
      emailOptions = {
        ...commonOptions,
        ...(notification.content?.subject
          ? { subject: notification.content.subject }
          : {}),
        template: {
          id: configuredTemplateId.trim(),
          ...(variables ? { variables } : {}),
        },
      };
    } else if (!template) {
      const html = notification.content?.html;
      const text = notification.content?.text;
      const hasRawContent = Boolean(html) || Boolean(text);

      if (hasRawContent) {
        const subject =
          notification.content?.subject ?? this.getTemplateSubject(notification);
        emailOptions = {
          ...commonOptions,
          subject,
          ...(html ? { html } : {}),
          // Ensure at least one render key is present for Resend typings
          text: text ?? html ?? "",
        };
      } else {
        this.logger.error(
          `Couldn't find an email template for ${notification.template}. The valid options are ${Object.values(
            Templates
          )}`
        );
        return {};
      }
    } else if (typeof template === "string") {
      const subject =
        notification.content?.subject ?? this.getTemplateSubject(notification);
      emailOptions = {
        ...commonOptions,
        subject,
        html: template,
      };
    } else {
      const subject =
        notification.content?.subject ?? this.getTemplateSubject(notification);
      emailOptions = {
        ...commonOptions,
        subject,
        react: template(notification.data),
      };
    }

    const attachments = resolveAttachments(notification);
    if (attachments?.length) {
      emailOptions = {
        ...emailOptions,
        attachments,
      };
    }

    const { data, error } = await this.resendClient.emails.send(emailOptions);

    if (error || !data?.id) {
      const detail = error ? JSON.stringify(error) : "unknown error";
      const message = "Failed to send email template=" + notification.template + " to=" + notification.to + ": " + detail;

      if (error) {
        this.logger.error(message, error as Error);
      } else {
        this.logger.error(message);
      }

      throw new Error(message);
    }

    return { id: data.id };
  }
}

export default ResendNotificationProviderService;
