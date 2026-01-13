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
};

const ADMIN_ACTORS = new Set(["user", "admin"]);
const DEFAULT_ADMIN_BASE_URL = "https://admin.teherguminet.hu";
const DEFAULT_ADMIN_PATH = "/app/reset-password";
const DEFAULT_STOREFRONT_BASE_URL = "https://teherguminet.hu";
const DEFAULT_STOREFRONT_PATH = "/account/reset-password";
const DEFAULT_TOKEN_QUERY_KEY = "token";
const DEFAULT_EXPIRY_MINUTES = 15;

const resolveLogger = (container: SubscriberArgs["container"]) => {
  try {
    return container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  } catch {
    return undefined;
  }
};

const normalizeBaseUrl = (value: string) => value.replace(/\/$/, "");

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

const resolveTemplate = (actorType: string) => {
  const fallback =
    actorType === "user" || actorType === "admin"
      ? process.env.ADMIN_RESET_PASSWORD_URL_TEMPLATE
      : process.env.STOREFRONT_RESET_PASSWORD_URL_TEMPLATE;

  return (process.env.RESET_PASSWORD_URL_TEMPLATE || fallback || "").trim();
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

  return process.env.STOREFRONT_URL || DEFAULT_STOREFRONT_BASE_URL;
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
    return applyTemplate(template, token, entityId, actorType);
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
    return url.toString();
  } catch {
    const encodedToken = encodeURIComponent(token);
    return `${baseUrl}${path}?${tokenKey}=${encodedToken}`;
  }
};

export default async function passwordResetHandler({
  event,
  container,
}: SubscriberArgs<PasswordResetEventPayload>) {
  const payload = event?.data ?? {};
  const entityId =
    typeof payload.entity_id === "string" ? payload.entity_id : "";
  const token = typeof payload.token === "string" ? payload.token : "";
  const actorType =
    typeof payload.actor_type === "string" ? payload.actor_type : "customer";

  if (!entityId || !token) {
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

  const resetUrl = resolveResetUrl(actorType, token, entityId);

  if (!resetUrl) {
    return;
  }

  const notification: CreateNotificationDTO = {
    to: entityId,
    channel: "email",
    template: "password-reset",
    data: {
      reset_url: resetUrl,
      email: entityId,
      actor_type: actorType,
      expires_in_minutes: DEFAULT_EXPIRY_MINUTES,
    },
    trigger_type: "auth.password_reset",
    resource_id: entityId,
    resource_type: "auth",
  };

  const logger = resolveLogger(container);

  await dispatchNotificationsIndividually(
    notificationModuleService,
    [notification],
    logger
  );
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
};
