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

type PasswordResetLanguage = "hu" | "sk";

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

const normalizeBaseUrl = (value: string) => value.replace(/\/$/, "");
const normalizeStorefrontDomain = (value: string) =>
  value.replace(/therguminet\.hu/gi, "teherguminet.hu");

const normalizeLanguage = (value: string | null | undefined): PasswordResetLanguage | null => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("sk") || normalized.includes("slovak")) {
    return "sk";
  }

  if (normalized.startsWith("hu") || normalized.includes("hungarian")) {
    return "hu";
  }

  return null;
};

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

const resolveLanguageFromResetUrl = (
  resetUrl: string
): PasswordResetLanguage | null => {
  if (!resetUrl) {
    return null;
  }

  try {
    const url = new URL(resetUrl);
    const localeSegment =
      url.pathname.split("/").filter(Boolean)[0]?.trim().toLowerCase() ?? "";

    if (localeSegment === "hu" || localeSegment === "sk") {
      return localeSegment;
    }

    return (
      normalizeLanguage(url.searchParams.get("locale")) ??
      normalizeLanguage(url.searchParams.get("language")) ??
      normalizeLanguage(url.searchParams.get("lang"))
    );
  } catch {
    return null;
  }
};

const resolveDefaultStorefrontLanguage = (): PasswordResetLanguage => {
  const fromEnv =
    normalizeLanguage(process.env.STOREFRONT_DEFAULT_LOCALE) ??
    normalizeLanguage(process.env.STOREFRONT_DEFAULT_LANGUAGE) ??
    normalizeLanguage(process.env.NEXT_PUBLIC_DEFAULT_REGION);

  return fromEnv ?? "hu";
};

const applyLanguagePrefixToStorefrontUrl = (
  resetUrl: string,
  language: PasswordResetLanguage
) => {
  if (!resetUrl) {
    return resetUrl;
  }

  try {
    const url = new URL(resetUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const firstSegment = segments[0]?.trim().toLowerCase() ?? "";

    if (firstSegment === "hu" || firstSegment === "sk") {
      return url.toString();
    }

    url.pathname = `/${language}${url.pathname.startsWith("/") ? "" : "/"}${url.pathname}`
      .replace(/\/{2,}/g, "/");
    return url.toString();
  } catch {
    return resetUrl;
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

  const resetLanguage = isAdminActor(actorType)
    ? "hu"
    : resolveLanguageFromResetUrl(resetUrl) ?? resolveDefaultStorefrontLanguage();
  const localizedResetUrl = isAdminActor(actorType)
    ? resetUrl
    : applyLanguagePrefixToStorefrontUrl(resetUrl, resetLanguage);

  const notification: CreateNotificationDTO = {
    to: entityId,
    channel: "email",
    template: "password-reset",
    data: {
      reset_url: localizedResetUrl,
      email: entityId,
      actor_type: actorType,
      language: resetLanguage,
      locale: resetLanguage === "sk" ? "sk-SK" : "hu-HU",
      countryCode: resetLanguage.toUpperCase(),
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
