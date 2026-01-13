import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import type {
  CartDTO,
  CartLineItemDTO,
  CustomerDTO,
  Logger,
} from "@medusajs/framework/types";

import { dispatchNotificationsIndividually } from "../../lib/dispatch-notifications";

export type AbandonedCartItem = CartLineItemDTO & {
  variant?: {
    title?: string | null;
    thumbnail?: string | null;
  } | null;
};

export type AbandonedCart = Omit<
  CartDTO,
  | "customer"
  | "region"
  | "items"
  | "metadata"
  | "shipping_address"
  | "billing_address"
> & {
  customer: CustomerDTO | null;
  region?: { currency_code?: string | null } | null;
  items?: AbandonedCartItem[];
  metadata?: Record<string, unknown> | null;
  shipping_address?: {
    country_code?: string | null;
    first_name?: string | null;
  } | null;
  billing_address?: { country_code?: string | null } | null;
};

type SendAbandonedNotificationsInput = {
  carts: AbandonedCart[];
};

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "hello@tehergumi.net";
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "+36 1 234 5678";
const TEMPLATE_NAME = "abandoned-cart";

const prepareCartItems = (cart: AbandonedCart) =>
  (cart.items ?? []).map((item, index) => ({
    id: item.id || `${cart.id}-item-${index}`,
    title: item.title ?? item.variant?.title ?? null,
    quantity: typeof item.quantity === "number" ? item.quantity : 1,
    unit_price: item.unit_price ?? 0,
    thumbnail: item.thumbnail,
  }));

export const sendAbandonedNotificationsStep = createStep(
  "send-abandoned-notifications",
  async (input: SendAbandonedNotificationsInput, { container }) => {
    if (!input.carts?.length) {
      return new StepResponse({ notifications: [] });
    }

    const storefrontUrl =
      process.env.STOREFRONT_URL?.trim() || "https://therguminet.hu";

    const notificationModuleService = container.resolve(Modules.NOTIFICATION);

    const notificationsPayload = input.carts
      .filter((cart) => Boolean(cart.email))
      .map((cart) => {
        const metadata = (cart.metadata ?? {}) as Record<string, unknown>;
        const recoverUrl = new URL(
          `/cart/recover/${cart.id}`,
          storefrontUrl
        ).toString();
        const firstName =
          cart.customer?.first_name ??
          cart.shipping_address?.first_name ??
          null;
        const currencyCode = (
          cart.region?.currency_code ?? "HUF"
        ).toUpperCase();
        const language =
          typeof metadata.locale === "string"
            ? metadata.locale
            : typeof metadata.language === "string"
              ? metadata.language
              : typeof metadata.lang === "string"
                ? metadata.lang
                : undefined;
        const countryCode =
          typeof cart.shipping_address?.country_code === "string"
            ? cart.shipping_address.country_code
            : typeof cart.billing_address?.country_code === "string"
              ? cart.billing_address.country_code
              : undefined;

        return {
          to: cart.email!,
          channel: "email",
          template: TEMPLATE_NAME,
          data: {
            customerName: firstName,
            recoverUrl,
            currencyCode,
            language,
            countryCode,
            storefrontUrl,
            supportEmail: SUPPORT_EMAIL,
            supportPhone: SUPPORT_PHONE,
            items: prepareCartItems(cart),
          },
        };
      });

    if (!notificationsPayload.length) {
      return new StepResponse({ notifications: [] });
    }

    let logger: Logger | undefined;
    try {
      logger = container.resolve("logger");
    } catch {
      logger = undefined;
    }

    const notifications = await dispatchNotificationsIndividually(
      notificationModuleService,
      notificationsPayload,
      logger
    );

    return new StepResponse({
      notifications,
    });
  }
);
