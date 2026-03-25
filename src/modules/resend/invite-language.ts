import { LanguageCode, resolveLanguageFromHints } from "./email-language";

type InviteLanguageSource = {
  locale?: unknown;
  language?: unknown;
  lang?: unknown;
  countryCode?: unknown;
  currencyCode?: unknown;
  email?: unknown;
  metadata?: Record<string, unknown> | null;
} | null;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const resolveFromEmailDomain = (email?: string): LanguageCode | null => {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return null;
  }

  if (normalized.endsWith(".sk")) {
    return "sk";
  }

  return null;
};

export const resolveInviteLanguage = (
  source?: InviteLanguageSource
): LanguageCode => {
  const metadata =
    source?.metadata && typeof source.metadata === "object"
      ? source.metadata
      : {};

  const hintValues = [
    source?.locale,
    source?.language,
    source?.lang,
    source?.countryCode,
    source?.currencyCode,
    metadata.locale,
    metadata.language,
    metadata.lang,
    metadata.countryCode,
    metadata.country_code,
    metadata.currencyCode,
    metadata.currency_code,
  ];

  const hasExplicitHints = hintValues.some(
    (value) => typeof value === "string" && value.trim().length > 0
  );

  const language = resolveLanguageFromHints({
    locale: asString(source?.locale) ?? asString(metadata.locale),
    language: asString(source?.language) ?? asString(metadata.language),
    lang: asString(source?.lang) ?? asString(metadata.lang),
    countryCode:
      asString(source?.countryCode) ??
      asString(metadata.countryCode) ??
      asString(metadata.country_code),
    currencyCode:
      asString(source?.currencyCode) ??
      asString(metadata.currencyCode) ??
      asString(metadata.currency_code),
  });

  if (hasExplicitHints) {
    return language;
  }

  return resolveFromEmailDomain(asString(source?.email)) ?? language;
};
