import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { LanguageCode, resolveLanguageFromOrder } from "../email-language";

import {
  CONTACT_EMAIL,
  CONTACT_PHONE,
  F1_RED,
  buildOrderUrl,
  resolveCustomerName,
  resolveOrderId,
  type OrderEmailOrder,
} from "./order-email-shared";

/**
 * =============================================================================
 * GLS Label Cancelled (Design v2)
 * - Stronger hierarchy, status badge, responsive grid
 * - Dark-mode aware tokens
 * - Better logic around parcels: show list + optional tracking links
 * - Safer copy fallback + stricter language selection
 * - Centralized tokens for consistent spacing/typography
 * =============================================================================
 */

export type GlsLabelCancelledEmailProps = {
  order: OrderEmailOrder;
  parcelNumbers?: string[] | null;
  /**
   * Optional: If your system can generate tracking URLs, pass a resolver.
   * If undefined, we render parcel numbers as plain text.
   */
  buildTrackingUrl?: (
    parcelNumber: string,
    lang: LanguageCode,
  ) => string | null;
  /**
   * Optional: show secondary CTA to contact support
   */
  showSupportCta?: boolean;
  /**
   * Optional: brand overrides
   */
  brand?: {
    name?: string;
    domain?: string;
    logoUrl?: string;
    logoAlt?: string;
  };
};

/**
 * =============================================================================
 * Foundations
 * =============================================================================
 */

const FONT_STACK =
  '"SF Pro Text","SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

const MONO_STACK =
  '"SF Mono","SFMono-Regular",ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace';

const BRAND = {
  name: "TEHERGUMINET",
  domain: "Teherguminet.hu",
  logoUrl: "https://teherguminet.hu/assets/email/teherguminet-mark.png",
  logoAlt: "Teherguminet",
};

const TOKENS = {
  radius: {
    outer: 24,
    inner: 16,
    pill: 999,
  },
  border: {
    subtle: "1px solid #E5E7EB",
    subtleDark: "1px solid #2A2F3A",
  },
  shadow: {
    card: "0 16px 40px rgba(17,17,17,0.08)",
    cardDark: "0 16px 40px rgba(0,0,0,0.35)",
  },
  color: {
    bg: "#ffffff",
    text: "#111111",
    muted: "#6B7280",
    subtle: "#F9FAFB",
    subtle2: "#F3F4F6",
    border: "#E5E7EB",
    brand: F1_RED,
    link: "#111111",
    ok: "#0EA5E9",
    warn: "#F59E0B",
    danger: "#EF4444",
    darkBg: "#0B0F19",
    darkCard: "#0F1629",
    darkText: "#E5E7EB",
    darkMuted: "#A1A1AA",
    darkSubtle: "#111827",
    darkBorder: "#2A2F3A",
    darkLink: "#E5E7EB",
  },
  space: {
    pageY: 36,
    pageX: 20,
    cardPad: 28,
    cardPadSm: 20,
    sectionGap: 16,
    elementGap: 12,
    microGap: 8,
  },
  type: {
    brand: 14,
    title: 24,
    subtitle: 15,
    body: 14,
    small: 12,
    micro: 11,
  },
  line: {
    title: "1.2",
    subtitle: "22px",
    body: "20px",
    small: "18px",
  },
};

type Css = React.CSSProperties;

const styles = {
  body: {
    backgroundColor: TOKENS.color.bg,
    margin: 0,
    padding: `${TOKENS.space.pageY}px 0`,
    fontFamily: FONT_STACK,
    color: TOKENS.color.text,
  } as Css,

  container: {
    width: "100%",
    maxWidth: "680px",
    margin: "0 auto",
    padding: `0 ${TOKENS.space.pageX}px`,
  } as Css,

  card: {
    borderRadius: `${TOKENS.radius.outer}px`,
    backgroundColor: TOKENS.color.bg,
    border: TOKENS.border.subtle,
    boxShadow: TOKENS.shadow.card,
    overflow: "hidden",
  } as Css,

  header: {
    padding: `${TOKENS.space.cardPad}px ${TOKENS.space.cardPad}px 16px`,
    backgroundColor: TOKENS.color.brand,
  } as Css,

  headerTopRow: {
    width: "100%",
  } as Css,

  brandWrap: {
    display: "inline-block",
    textDecoration: "none",
  } as Css,

  brandRow: {
    verticalAlign: "middle",
  } as Css,

  logo: {
    display: "inline-block",
    verticalAlign: "middle",
    borderRadius: 10,
  } as Css,

  brand: {
    fontSize: `${TOKENS.type.brand}px`,
    fontWeight: 800,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    margin: 0,
    color: "#ffffff",
    textDecoration: "none",
    display: "inline-block",
    fontFamily: FONT_STACK,
  } as Css,

  badge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: `${TOKENS.radius.pill}px`,
    border: "1px solid rgba(239,68,68,0.35)",
    backgroundColor: "rgba(239,68,68,0.08)",
    color: TOKENS.color.danger,
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontFamily: FONT_STACK,
  } as Css,

  title: {
    margin: "14px 0 0",
    fontSize: `${TOKENS.type.title}px`,
    lineHeight: TOKENS.line.title,
    fontWeight: 800,
    color: "#ffffff",
    fontFamily: FONT_STACK,
  } as Css,

  subtitle: {
    margin: "10px 0 0",
    fontSize: `${TOKENS.type.subtitle}px`,
    lineHeight: TOKENS.line.subtitle,
    color: "#FEE2E2",
    fontFamily: FONT_STACK,
  } as Css,

  divider: {
    borderTop: TOKENS.border.subtle,
    margin: 0,
  } as Css,

  content: {
    padding: `18px ${TOKENS.space.cardPad}px ${TOKENS.space.cardPad}px`,
  } as Css,

  grid: {
    marginTop: `${TOKENS.space.sectionGap}px`,
  } as Css,

  detailCard: {
    borderRadius: `${TOKENS.radius.inner}px`,
    border: TOKENS.border.subtle,
    backgroundColor: TOKENS.color.subtle,
    padding: "16px",
  } as Css,

  label: {
    fontSize: `${TOKENS.type.micro}px`,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    color: TOKENS.color.muted,
    margin: "0 0 6px",
    fontFamily: FONT_STACK,
  } as Css,

  value: {
    fontSize: "15px",
    fontWeight: 800,
    color: TOKENS.color.text,
    margin: 0,
    fontFamily: FONT_STACK,
    wordBreak: "break-word",
  } as Css,

  valueMono: {
    fontSize: "14px",
    fontWeight: 700,
    color: TOKENS.color.text,
    margin: 0,
    fontFamily: MONO_STACK,
    wordBreak: "break-word",
  } as Css,

  list: {
    margin: "8px 0 0",
    padding: "0 0 0 16px",
  } as Css,

  listItem: {
    margin: "0 0 6px",
    fontSize: `${TOKENS.type.body}px`,
    lineHeight: TOKENS.line.body,
    color: TOKENS.color.text,
    fontFamily: FONT_STACK,
  } as Css,

  hint: {
    margin: "10px 0 0",
    fontSize: `${TOKENS.type.small}px`,
    lineHeight: TOKENS.line.small,
    color: TOKENS.color.muted,
    fontFamily: FONT_STACK,
  } as Css,

  ctaRow: {
    marginTop: `${TOKENS.space.sectionGap}px`,
  } as Css,

  cta: {
    backgroundColor: TOKENS.color.brand,
    borderRadius: `${TOKENS.radius.pill}px`,
    padding: "12px 18px",
    fontSize: "14px",
    fontWeight: 800,
    color: "#ffffff",
    textDecoration: "none",
    display: "inline-block",
    fontFamily: FONT_STACK,
  } as Css,

  ctaSecondary: {
    backgroundColor: TOKENS.color.subtle2,
    borderRadius: `${TOKENS.radius.pill}px`,
    padding: "12px 18px",
    fontSize: "14px",
    fontWeight: 800,
    color: TOKENS.color.text,
    textDecoration: "none",
    display: "inline-block",
    fontFamily: FONT_STACK,
    border: TOKENS.border.subtle,
  } as Css,

  link: {
    color: TOKENS.color.link,
    textDecoration: "underline",
    fontFamily: FONT_STACK,
    wordBreak: "break-word",
  } as Css,

  supportBox: {
    marginTop: `${TOKENS.space.sectionGap}px`,
    borderRadius: `${TOKENS.radius.inner}px`,
    border: TOKENS.border.subtle,
    backgroundColor: TOKENS.color.bg,
    padding: "16px",
  } as Css,

  supportTitle: {
    margin: 0,
    fontSize: "14px",
    fontWeight: 800,
    color: TOKENS.color.text,
    fontFamily: FONT_STACK,
  } as Css,

  supportText: {
    margin: "8px 0 0",
    fontSize: `${TOKENS.type.small}px`,
    lineHeight: TOKENS.line.small,
    color: TOKENS.color.muted,
    fontFamily: FONT_STACK,
  } as Css,

  footer: {
    textAlign: "center",
    fontSize: `${TOKENS.type.small}px`,
    lineHeight: TOKENS.line.small,
    color: TOKENS.color.muted,
    margin: "16px 0 0",
    fontFamily: FONT_STACK,
  } as Css,

  footerFine: {
    textAlign: "center",
    fontSize: "11px",
    lineHeight: "16px",
    color: TOKENS.color.muted,
    margin: "10px 0 0",
    fontFamily: FONT_STACK,
  } as Css,

  /**
   * Dark mode meta: React Email supports <style> in Head, but many clients vary.
   * We keep inline tokens for light mode and provide dark overrides via media query.
   */
} as const;

/**
 * =============================================================================
 * Copy (multi-language)
 * =============================================================================
 */

type LanguageBlock = {
  code: LanguageCode;
  locale: string;
  preview: string;
  title: string;
  badge: string;
  intro: (name: string) => string;
  body: string;
  body2?: string;
  orderLabel: string;
  parcelLabel: string;
  parcelEmpty: string;
  parcelHint?: string;
  cta: string;
  ctaSecondary?: string;
  supportTitle: string;
  supportBody: string;
  email: string;
  phone: string;
  legal: string;
};

const LANGUAGES: LanguageBlock[] = [
  {
    code: "hu",
    locale: "hu-HU",
    preview: "GLS címke törölve",
    title: "A GLS címkét töröltük",
    badge: "Törölve",
    intro: (name) => `Szia ${name},`,
    body: "A rendelésedhez tartozó GLS szállítási címkét töröltük. Ez általában azt jelenti, hogy a szállítási folyamat újraütemezés alatt áll.",
    body2:
      "Ha szükséges, új címkét készítünk, és külön értesítünk. A rendelésed adatait alább találod.",
    orderLabel: "Rendelés azonosító",
    parcelLabel: "Csomagszám(ok)",
    parcelEmpty: "Jelenleg nincs megadva csomagszám.",
    parcelHint:
      "Ha már van csomagszámod, de itt nem látod, a rendszer szinkronizációja pár percet igénybe vehet.",
    cta: "Rendelés megtekintése",
    ctaSecondary: "Kapcsolat",
    supportTitle: "Támogatás",
    supportBody:
      "Ha ez a változás nem várt, vagy gyors egyeztetésre van szükséged, vedd fel velünk a kapcsolatot.",
    email: "E-mail",
    phone: "Telefon",
    legal:
      "Ezt az értesítést a rendelésed státuszváltozása miatt küldtük. Kérjük, ne válaszolj közvetlenül erre az e-mailre.",
  },
  {
    code: "sk",
    locale: "sk-SK",
    preview: "GLS štítok zrušený",
    title: "GLS štítok bol zrušený",
    badge: "Zrušené",
    intro: (name) => `Ahoj ${name},`,
    body: "GLS prepravný štítok k tvojej objednávke bol zrušený. Zvyčajne to znamená, že doručenie je v procese úpravy.",
    body2:
      "Ak bude treba, pripravíme nový štítok a dáme ti vedieť. Nižšie nájdeš kľúčové údaje o objednávke.",
    orderLabel: "Číslo objednávky",
    parcelLabel: "Číslo(á) zásielky",
    parcelEmpty: "Momentálne nie je uvedené číslo zásielky.",
    parcelHint:
      "Ak už máš číslo zásielky, ale nevidíš ho tu, synchronizácia môže trvať niekoľko minút.",
    cta: "Zobraziť objednávku",
    ctaSecondary: "Kontakt",
    supportTitle: "Podpora",
    supportBody:
      "Ak je táto zmena nečakaná alebo potrebuješ rýchle potvrdenie, kontaktuj nás.",
    email: "E-mail",
    phone: "Telefón",
    legal:
      "Toto oznámenie sme poslali kvôli zmene stavu tvojej objednávky. Prosím, neodpovedaj priamo na tento e-mail.",
  },
];

function normalizeLanguage(
  code: LanguageCode | string | null | undefined,
): LanguageCode {
  if (!code) return "hu";
  const safe = String(code).toLowerCase();
  if (safe === "hu") return "hu";
  if (safe === "sk") return "sk";
  return "hu";
}

function resolveCopy(order: OrderEmailOrder): LanguageBlock {
  const lang = normalizeLanguage(resolveLanguageFromOrder(order));
  return LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]!;
}

function compactList(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const v of values) {
    const s = (v ?? "").trim();
    if (!s) continue;
    out.push(s);
  }
  return out;
}

function unique(values: string[]): string[] {
  const set = new Set<string>();
  for (const v of values) set.add(v);
  return Array.from(set);
}

function toDisplayParcelList(parcelNumbers?: string[] | null): string[] {
  if (!parcelNumbers || !Array.isArray(parcelNumbers)) return [];
  return unique(compactList(parcelNumbers));
}

function safeBrand(override?: GlsLabelCancelledEmailProps["brand"]) {
  return {
    name: override?.name ?? BRAND.name,
    domain: override?.domain ?? BRAND.domain,
    logoUrl: override?.logoUrl ?? BRAND.logoUrl,
    logoAlt: override?.logoAlt ?? BRAND.logoAlt,
  };
}

/**
 * =============================================================================
 * Small building blocks
 * =============================================================================
 */

function StatusBadge({ text }: { text: string }) {
  return <Text style={styles.badge}>{text}</Text>;
}

function KeyValue({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <Section>
      <Text style={styles.label}>{label}</Text>
      <Text style={mono ? styles.valueMono : styles.value}>{value}</Text>
    </Section>
  );
}

function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Button href={href} style={styles.cta}>
      {children}
    </Button>
  );
}

function SecondaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Button href={href} style={styles.ctaSecondary}>
      {children}
    </Button>
  );
}

function SupportBox({
  title,
  body,
  copy,
}: {
  title: string;
  body: string;
  copy: LanguageBlock;
}) {
  return (
    <Section style={styles.supportBox}>
      <Text style={styles.supportTitle}>{title}</Text>
      <Text style={styles.supportText}>{body}</Text>
      <Text style={{ ...styles.supportText, marginTop: "10px" }}>
        {copy.email}:{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
          {CONTACT_EMAIL}
        </Link>
        {" • "}
        {copy.phone}: {CONTACT_PHONE}
      </Text>
    </Section>
  );
}

function ParcelList({
  parcels,
  buildTrackingUrl,
  lang,
}: {
  parcels: string[];
  buildTrackingUrl?: (
    parcelNumber: string,
    lang: LanguageCode,
  ) => string | null;
  lang: LanguageCode;
}) {
  if (!parcels.length) return null;

  return (
    <Section>
      <ul style={styles.list}>
        {parcels.map((p) => {
          const trackingUrl = buildTrackingUrl?.(p, lang) ?? null;
          return (
            <li key={p} style={styles.listItem}>
              {trackingUrl ? (
                <Link href={trackingUrl} style={styles.link}>
                  {p}
                </Link>
              ) : (
                <span>{p}</span>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/**
 * =============================================================================
 * Email Component
 * =============================================================================
 */

export const GlsLabelCancelledEmail = ({
  order,
  parcelNumbers,
  buildTrackingUrl,
  showSupportCta = true,
  brand,
}: GlsLabelCancelledEmailProps) => {
  const copy = resolveCopy(order);
  const lang = normalizeLanguage(copy.code);
  const b = safeBrand(brand);

  const customerName = resolveCustomerName(order);
  const orderId = resolveOrderId(order);
  const orderUrl = buildOrderUrl(order.id, lang);

  const parcels = toDisplayParcelList(parcelNumbers);
  const hasParcels = parcels.length > 0;

  const supportMailto = `mailto:${CONTACT_EMAIL}`;
  const telHref = `tel:${String(CONTACT_PHONE).replace(/\s+/g, "")}`;

  const supportCtaHref = supportMailto;

  return (
    <Html lang={copy.code}>
      <Head>
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: ${TOKENS.color.darkBg} !important; }
            .card { background: ${TOKENS.color.darkCard} !important; border: ${TOKENS.border.subtleDark} !important; box-shadow: ${TOKENS.shadow.cardDark} !important; }
            .text { color: ${TOKENS.color.darkText} !important; }
            .muted { color: ${TOKENS.color.darkMuted} !important; }
            .subtle { background: ${TOKENS.color.darkSubtle} !important; border: ${TOKENS.border.subtleDark} !important; }
            a { color: ${TOKENS.color.darkLink} !important; }
            .secondaryCta { background: rgba(255,255,255,0.06) !important; border: ${TOKENS.border.subtleDark} !important; color: ${TOKENS.color.darkText} !important; }
          }
          @media (max-width: 520px) {
            .container { padding: 0 14px !important; }
            .header { padding: 22px 18px 14px !important; }
            .content { padding: 16px 18px 22px !important; }
            .title { font-size: 22px !important; }
          }
        `}</style>
      </Head>

      <Preview>{copy.preview}</Preview>

      <Body style={styles.body}>
        <Container style={styles.container} className="container">
          <Section style={styles.card} className="card">
            {/* Header */}
            <Section style={styles.header} className="header">
              <Section style={styles.headerTopRow}>
                <table
                  role="presentation"
                  style={{ width: "100%", borderCollapse: "collapse" }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{
                          width: "70%",
                          verticalAlign: "middle",
                        }}
                      >
                        <div style={styles.brandWrap}>
                          <table
                            role="presentation"
                            style={{ borderCollapse: "collapse" }}
                          >
                            <tbody>
                              <tr>
                                <td
                                  style={{
                                    width: "40px",
                                    verticalAlign: "middle",
                                  }}
                                >
                                  <img
                                    src={b.logoUrl}
                                    alt={b.logoAlt}
                                    width="32"
                                    height="32"
                                    style={styles.logo}
                                  />
                                </td>
                                <td style={{ verticalAlign: "middle" }}>
                                  <Text style={styles.brand}>{b.name}</Text>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>

                      <td
                        style={{
                          width: "30%",
                          textAlign: "right",
                          verticalAlign: "middle",
                        }}
                      >
                        <StatusBadge text={copy.badge} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>

              <Heading style={styles.title} className="title">
                {copy.title}
              </Heading>

              <Text style={styles.subtitle} className="text">
                {copy.intro(customerName)}
              </Text>

              <Text style={styles.subtitle} className="text">
                {copy.body}
              </Text>

              {copy.body2 ? (
                <Text style={styles.subtitle} className="text">
                  {copy.body2}
                </Text>
              ) : null}
            </Section>

            <Hr style={{ ...styles.divider, borderTop: "none" }} />

            {/* Content */}
            <Section style={styles.content} className="content">
              {/* Details grid */}
              <Section style={styles.grid}>
                <Section style={styles.detailCard} className="subtle">
                  <table
                    role="presentation"
                    style={{ width: "100%", borderCollapse: "collapse" }}
                  >
                    <tbody>
                      <tr>
                        <td style={{ width: "50%", paddingRight: "8px" }}>
                          <KeyValue
                            label={copy.orderLabel}
                            value={orderId}
                            mono
                          />
                        </td>
                        <td style={{ width: "50%", paddingLeft: "8px" }}>
                          <KeyValue
                            label="Customer email"
                            value={order.email ?? "—"}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <Hr style={{ ...styles.divider, margin: "14px 0" }} />

                  <KeyValue
                    label={copy.parcelLabel}
                    value={
                      hasParcels ? (
                        <span />
                      ) : (
                        <span style={{ fontWeight: 700 }}>
                          {copy.parcelEmpty}
                        </span>
                      )
                    }
                  />

                  {hasParcels ? (
                    <ParcelList
                      parcels={parcels}
                      buildTrackingUrl={buildTrackingUrl}
                      lang={lang}
                    />
                  ) : null}

                  {copy.parcelHint ? (
                    <Text style={styles.hint} className="muted">
                      {copy.parcelHint}
                    </Text>
                  ) : null}
                </Section>
              </Section>

              {/* CTA Row */}
              <Section style={styles.ctaRow}>
                <table
                  role="presentation"
                  style={{ width: "100%", borderCollapse: "collapse" }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{
                          width: showSupportCta ? "52%" : "100%",
                          verticalAlign: "middle",
                        }}
                      >
                        <PrimaryButton href={orderUrl}>
                          {copy.cta}
                        </PrimaryButton>
                      </td>

                      {showSupportCta ? (
                        <td
                          style={{
                            width: "48%",
                            textAlign: "right",
                            verticalAlign: "middle",
                          }}
                        >
                          <Button
                            href={supportCtaHref}
                            style={styles.ctaSecondary}
                            className="secondaryCta"
                          >
                            {copy.ctaSecondary ?? "Support"}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  </tbody>
                </table>

                <Text style={styles.hint} className="muted">
                  {copy.email}:{" "}
                  <Link href={supportMailto} style={styles.link}>
                    {CONTACT_EMAIL}
                  </Link>
                  {" • "}
                  {copy.phone}:{" "}
                  <Link href={telHref} style={styles.link}>
                    {CONTACT_PHONE}
                  </Link>
                </Text>
              </Section>

              {/* Support box */}
              <SupportBox
                title={copy.supportTitle}
                body={copy.supportBody}
                copy={copy}
              />

            </Section>
          </Section>

          {/* Footer */}
          <Text style={styles.footer} className="muted">
            {b.domain}
          </Text>

          <Text style={styles.footerFine} className="muted">
            {copy.legal}
          </Text>

          <Text style={styles.footerFine} className="muted">
            © {new Date().getFullYear()} {b.name}. All rights reserved.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

/**
 * =============================================================================
 * Mock props (React Email dev server)
 * =============================================================================
 */

const mockProps: GlsLabelCancelledEmailProps = {
  order: {
    id: "order_123",
    display_id: 42,
    email: "partner@teherguminet.hu",
    currency_code: "HUF",
    shipping_address: {
      first_name: "Viktor",
      country_code: "hu",
    },
  },
  parcelNumbers: [
    "3385368853",
    "3385368853", // dup to validate unique()
    "  ", // blank to validate compactList()
  ],
  buildTrackingUrl: (parcelNumber, lang) => {
    // Replace with your GLS tracking deep link strategy.
    // Keep logic deterministic and side-effect free.
    const encoded = encodeURIComponent(parcelNumber);
    if (lang === "hu")
      return `https://gls-group.com/HU/hu/kovetes?match=${encoded}`;
    if (lang === "sk")
      return `https://gls-group.com/SK/sk/sledovanie-zasielok?match=${encoded}`;
    return `https://gls-group.com/GROUP/en/parcel-tracking?match=${encoded}`;
  },
  showSupportCta: true,
  brand: {
    name: "TEHERGUMINET",
    domain: "Teherguminet.hu",
    logoUrl: "https://teherguminet.hu/assets/email/teherguminet-mark.png",
    logoAlt: "Teherguminet",
  },
};

// @ts-ignore - consumed by React Email dev server
export default () => <GlsLabelCancelledEmail {...mockProps} />;

/**
 * =============================================================================
 * Notes for implementation owners
 * =============================================================================
 *
 * 1) Deliverability:
 *    - Keep the markup simple, avoid nested complex tables.
 *    - Buttons are <a> under the hood; avoid JS.
 *
 * 2) Localization:
 *    - resolveLanguageFromOrder() should be deterministic.
 *    - normalizeLanguage() ensures we never crash on unknown codes.
 *
 * 3) Tracking URLs:
 *    - buildTrackingUrl is optional; avoid hardcoding when possible.
 *    - If you cannot guarantee correct URLs, omit them to prevent support churn.
 *
 * 4) Data quality:
 *    - Parcel numbers are deduplicated and trimmed.
 *    - Empty states are explicit to prevent customer confusion.
 *
 * 5) Brand controls:
 *    - brand prop allows reuse across white-label setups.
 *
 * 6) Dark mode:
 *    - Many clients only partially support @media queries.
 *    - We keep light mode solid and apply best-effort overrides.
 *
 * =============================================================================
 */

/**
 * =============================================================================
 * Additional optional helpers (future-proofing)
 * =============================================================================
 */

type OrderHealth = "green" | "amber" | "red";

function assessOrderHealth(input: {
  parcels: string[];
  email?: string | null;
}): OrderHealth {
  // Simple, deterministic ruleset. Expand when you have better signals.
  const hasEmail = Boolean((input.email ?? "").trim());
  const hasParcels = input.parcels.length > 0;

  if (!hasEmail) return "amber";
  if (!hasParcels) return "amber";
  return "green";
}

function healthToBadge(health: OrderHealth) {
  if (health === "green") {
    return {
      text: "Healthy",
      border: "1px solid rgba(14,165,233,0.35)",
      bg: "rgba(14,165,233,0.10)",
      color: TOKENS.color.ok,
    };
  }
  if (health === "amber") {
    return {
      text: "Attention",
      border: "1px solid rgba(245,158,11,0.35)",
      bg: "rgba(245,158,11,0.10)",
      color: TOKENS.color.warn,
    };
  }
  return {
    text: "Risk",
    border: "1px solid rgba(239,68,68,0.35)",
    bg: "rgba(239,68,68,0.10)",
    color: TOKENS.color.danger,
  };
}

/**
 * Example: If you want to swap the cancel badge to a system health badge,
 * replace <StatusBadge text={copy.badge} /> with a custom component below.
 */

function HealthBadge({ order }: { order: OrderEmailOrder }) {
  const parcels = toDisplayParcelList(null);
  const health = assessOrderHealth({ parcels, email: order.email });
  const ui = healthToBadge(health);

  const style: Css = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: `${TOKENS.radius.pill}px`,
    border: ui.border,
    backgroundColor: ui.bg,
    color: ui.color,
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontFamily: FONT_STACK,
  };

  return <Text style={style}>{ui.text}</Text>;
}

/**
 * =============================================================================
 * End of file
 * =============================================================================
 */
