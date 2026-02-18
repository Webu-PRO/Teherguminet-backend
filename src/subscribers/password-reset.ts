import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type {
  CreateNotificationDTO,
  INotificationModuleService,
  Logger,
} from "@medusajs/types";

import { dispatchNotificationsIndividually } from "../lib/dispatch-notifications";

type PasswordResetEventPayload = {
  entity_id?: string | null;
  actor_type?: string | null;
  token?: string | null;
  identifier?: string | null;
  email?: string | null;
};

const ADMIN_ACTORS = new Set(["user", "admin"]);
const DEFAULT_ADMIN_BASE_URL = "https://admin.teherguminet.hu";
const DEFAULT_ADMIN_PATH = "/app/reset-password";
const DEFAULT_STOREFRONT_BASE_URL = "https://teherguminet.hu";
const DEFAULT_STOREFRONT_PATH = "/account";
const DEFAULT_TOKEN_QUERY_KEY = "token";
const DEFAULT_EXPIRY_MINUTES = 15;

const resolveLogger = (container: SubscriberArgs["container"]) => {
  try {
    return container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  } catch {
    return undefined;
  }
};

const readString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : "";
};

const normalizeBaseUrl = (value: string) => value.replace(/\/$/, "");
const normalizeStorefrontDomain = (value: string) =>
  value.replace(/therguminet\.hu/gi, "teherguminet.hu");

const normalizePath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const applyTemplate = (
  template: string,
  token: string,
  entityId: string,
  actorType: string
) => {
  const encodedToken = encodeURIComponent(token);
  return template
    .replace(/{{\s*encoded_token\s*}}/gi, encodedToken)
    .replace(/{{\s*token\s*}}/gi, encodedToken)
    .replace(/{{\s*raw_token\s*}}/gi, token)
    .replace(/{{\s*entity_id\s*}}/gi, encodeURIComponent(entityId))
    .replace(/{{\s*actor_type\s*}}/gi, actorType);
};

const isAdminActor = (actorType: string) =>
  ADMIN_ACTORS.has(actorType.trim().toLowerCase());

const resolveTemplate = (actorType: string) => {
  const fallback =
    actorType === "user" || actorType === "admin"
      ? process.env.ADMIN_RESET_PASSWORD_URL_TEMPLATE
      : process.env.STOREFRONT_RESET_PASSWORD_URL_TEMPLATE;

  const resolved = (process.env.RESET_PASSWORD_URL_TEMPLATE || fallback || "").trim();
  if (!resolved) {
    return "";
  }

  return isAdminActor(actorType) ? resolved : normalizeStorefrontDomain(resolved);
};

const resolveBaseUrl = (actorType: string) => {
  if (actorType === "user" || actorType === "admin") {
    return (
      process.env.ADMIN_FRONTEND_URL ||
      process.env.ADMIN_DASHBOARD_URL ||
      process.env.MEDUSA_ADMIN_URL ||
      process.env.ADMIN_URL ||
      DEFAULT_ADMIN_BASE_URL
    );
  }

  return normalizeStorefrontDomain(
    process.env.STOREFRONT_URL || DEFAULT_STOREFRONT_BASE_URL
  );
};

const resolvePath = (actorType: string) => {
  if (actorType === "user" || actorType === "admin") {
    return process.env.ADMIN_RESET_PASSWORD_PATH || DEFAULT_ADMIN_PATH;
  }

  return process.env.STOREFRONT_RESET_PASSWORD_PATH || DEFAULT_STOREFRONT_PATH;
};

const resolveResetUrl = (
  actorType: string,
  token: string,
  entityId: string
) => {
  const template = resolveTemplate(actorType);
  if (template) {
    const resolved = applyTemplate(template, token, entityId, actorType);
    return isAdminActor(actorType)
      ? resolved
      : normalizeStorefrontDomain(resolved);
  }

  const baseUrl = normalizeBaseUrl(resolveBaseUrl(actorType));
  let path = normalizePath(resolvePath(actorType));

  if (baseUrl.endsWith("/app") && path.startsWith("/app/")) {
    path = path.replace(/^\/app/, "");
  }

  const tokenKey =
    process.env.RESET_PASSWORD_TOKEN_QUERY_KEY?.trim() ||
    DEFAULT_TOKEN_QUERY_KEY;

  try {
    const url = new URL(path || "/", baseUrl);
    url.searchParams.set(tokenKey, token);
    const resolved = url.toString();
    return isAdminActor(actorType)
      ? resolved
      : normalizeStorefrontDomain(resolved);
  } catch {
    const encodedToken = encodeURIComponent(token);
    const resolved = `${baseUrl}${path}?${tokenKey}=${encodedToken}`;
    return isAdminActor(actorType)
      ? resolved
      : normalizeStorefrontDomain(resolved);
  }
};

export default async function passwordResetHandler({
  event,
  container,
}: SubscriberArgs<PasswordResetEventPayload>) {
  const payload = event?.data ?? {};
  const entityId = readString(payload.entity_id);
  const token = readString(payload.token);
  const actorType = readString(payload.actor_type) || "customer";

  const recipientEmail =
    readString(payload.email) ||
    readString(payload.identifier) ||
    entityId;

  const urlEntityId = entityId || recipientEmail;

  if (!recipientEmail || !token) {
    return;
  }

  let notificationModuleService: INotificationModuleService;
  try {
    notificationModuleService = container.resolve<INotificationModuleService>(
      Modules.NOTIFICATION
    );
  } catch {
    return;
  }

  const resetUrl = resolveResetUrl(actorType, token, urlEntityId);

  if (!resetUrl) {
    return;
  }

  const notification: CreateNotificationDTO = {
    to: recipientEmail,
    channel: "email",
    template: "password-reset",
    data: {
      reset_url: resetUrl,
      email: recipientEmail,
      actor_type: actorType,
      expires_in_minutes: DEFAULT_EXPIRY_MINUTES,
    },
    trigger_type: "auth.password_reset",
    resource_id: urlEntityId,
    resource_type: "auth",
  };

  const logger = resolveLogger(container);

  const created = await dispatchNotificationsIndividually(
    notificationModuleService,
    [notification],
    logger,
    {
      concurrency: 1,
      failOnError: true,
    }
  );

  if (!created.length) {
    throw new Error(
      `password-reset subscriber: notification was not created for ${recipientEmail}`
    );
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
};
