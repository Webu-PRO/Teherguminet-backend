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
  LANGUAGE_THEMES,
  buildOrderUrl,
  resolveCustomerName,
  resolveOrderId,
  type LanguageTheme,
  type OrderEmailOrder,
} from "./order-email-shared";

export type GlsShipmentCreatedEmailProps = {
  order: OrderEmailOrder;
  parcelNumbers?: string[] | null;

  /**
   * Optional: if you want parcel numbers to be clickable, pass a builder.
   * If undefined, parcels render as plain text.
   */
  buildTrackingUrl?: (
    parcelNumber: string,
    language: LanguageCode,
  ) => string | null;

  /**
   * Optional brand overrides
   */
  brand?: {
    name?: string;
    domain?: string;
    websiteUrl?: string;
    logoUrl?: string;
    logoAlt?: string;
  };

  /**
   * Optional: pass prebuilt order url (recommended from subscriber)
   */
  order_url?: string | null;
};

const FONT_STACK =
  '"SF Pro Text","SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

type LanguageBlock = {
  code: LanguageCode;
  locale: string;
  preview: (orderId: string) => string;
  heading: string;
  intro: (name: string, orderId: string) => React.ReactNode;
  badge: string;
  listTitle: string;
  listHint: string;
  noItemsCopy: string;
  ctaLabel: string;
  secondaryCtaLabel: string;
  contactTitle: string;
  contactCopy: React.ReactNode;
  closingLines: string[];
  footer: string;
  theme: LanguageTheme;
};

const BRAND_DEFAULT = {
  name: "TEHERGUMINET",
  domain: "Teherguminet.hu",
  websiteUrl: "https://teherguminet.hu",
  logoUrl: "https://teherguminet.hu/assets/email/teherguminet-mark.png",
  logoAlt: "Teherguminet",
};

const TOKENS = {
  radius: { outer: 24, inner: 16, pill: 999 },
  border: { light: "1px solid #E5E7EB", dark: "1px solid #2A2F3A" },
  shadow: {
    light: "0 16px 40px rgba(17,17,17,0.08)",
    dark: "0 16px 40px rgba(0,0,0,0.35)",
  },
  color: {
    bg: "#ffffff",
    text: "#111111",
    muted: "#6B7280",
    subtle: "#F9FAFB",
    subtle2: "#F3F4F6",
    border: "#E5E7EB",
    brand: F1_RED,
    brandSoft: "rgba(225, 6, 0, 0.10)",
    ok: "#0EA5E9",
    okSoft: "rgba(14, 165, 233, 0.10)",
    link: "#111111",
    darkBg: "#0B0F19",
    darkCard: "#0F1629",
    darkText: "#E5E7EB",
    darkMuted: "#A1A1AA",
    darkSubtle: "#111827",
    darkBorder: "#2A2F3A",
    darkLink: "#E5E7EB",
  },
  space: { pageY: 36, pageX: 20, pad: 28, padSm: 18, gap: 16 },
  type: { brand: 14, title: 24, body: 15, small: 12, micro: 11 },
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
    border: TOKENS.border.light,
    boxShadow: TOKENS.shadow.light,
    overflow: "hidden",
  } as Css,
  header: {
    padding: `${TOKENS.space.pad}px ${TOKENS.space.pad}px 14px`,
  } as Css,
  headerTopRow: {
    width: "100%",
  } as Css,
  brandWrap: {
    display: "inline-block",
    textDecoration: "none",
  } as Css,
  brandText: {
    fontSize: `${TOKENS.type.brand}px`,
    fontWeight: 900,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    margin: 0,
    color: TOKENS.color.text,
    textDecoration: "none",
    display: "inline-block",
    fontFamily: FONT_STACK,
  } as Css,
  logo: {
    display: "inline-block",
    verticalAlign: "middle",
    borderRadius: 10,
  } as Css,
  title: {
    margin: "14px 0 10px",
    fontSize: `${TOKENS.type.title}px`,
    lineHeight: "1.2",
    fontWeight: 900,
    color: TOKENS.color.text,
    fontFamily: FONT_STACK,
  } as Css,
  p: {
    fontSize: `${TOKENS.type.body}px`,
    lineHeight: "22px",
    margin: "0 0 12px",
    color: TOKENS.color.text,
    fontFamily: FONT_STACK,
  } as Css,
  muted: {
    fontSize: `${TOKENS.type.small}px`,
    lineHeight: "18px",
    color: TOKENS.color.muted,
    margin: 0,
    fontFamily: FONT_STACK,
  } as Css,
  divider: {
    borderTop: TOKENS.border.light,
    margin: 0,
  } as Css,
  badge: {
    display: "inline-block",
    borderRadius: `${TOKENS.radius.pill}px`,
    padding: "7px 12px",
    fontSize: `${TOKENS.type.micro}px`,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    fontWeight: 900,
    margin: "0 0 12px",
    border: `1px solid rgba(14, 165, 233, 0.35)`,
    backgroundColor: TOKENS.color.okSoft,
    color: TOKENS.color.ok,
    fontFamily: FONT_STACK,
  } as Css,
  content: {
    padding: `16px ${TOKENS.space.pad}px ${TOKENS.space.pad}px`,
  } as Css,
  detailCard: {
    marginTop: "6px",
    padding: "16px",
    borderRadius: `${TOKENS.radius.inner}px`,
    backgroundColor: TOKENS.color.subtle,
    border: TOKENS.border.light,
  } as Css,
  label: {
    fontSize: `${TOKENS.type.micro}px`,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    fontWeight: 900,
    margin: "0 0 8px",
    color: TOKENS.color.text,
    fontFamily: FONT_STACK,
  } as Css,
  parcelRow: {
    padding: "10px 0",
    borderBottom: "1px solid rgba(15,23,42,0.08)",
  } as Css,
  parcelValue: {
    fontSize: "14px",
    fontWeight: 900,
    margin: 0,
    color: TOKENS.color.text,
    fontFamily: FONT_STACK,
    wordBreak: "break-word",
  } as Css,
  parcelHint: {
    marginTop: "10px",
    fontSize: `${TOKENS.type.small}px`,
    lineHeight: "18px",
    color: TOKENS.color.muted,
    fontFamily: FONT_STACK,
  } as Css,
  ctaRow: {
    marginTop: TOKENS.space.gap,
  } as Css,
  ctaPrimary: {
    backgroundColor: TOKENS.color.brand,
    borderRadius: `${TOKENS.radius.pill}px`,
    padding: "12px 18px",
    fontSize: "14px",
    fontWeight: 900,
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
    fontWeight: 900,
    color: TOKENS.color.text,
    textDecoration: "none",
    display: "inline-block",
    fontFamily: FONT_STACK,
    border: TOKENS.border.light,
  } as Css,
  link: {
    color: TOKENS.color.link,
    textDecoration: "underline",
    fontFamily: FONT_STACK,
    wordBreak: "break-word",
  } as Css,
  footer: {
    textAlign: "center",
    fontSize: `${TOKENS.type.small}px`,
    lineHeight: "18px",
    color: TOKENS.color.muted,
    margin: "16px 0 0",
    fontFamily: FONT_STACK,
  } as Css,
  fineprint: {
    textAlign: "center",
    fontSize: "11px",
    lineHeight: "16px",
    color: TOKENS.color.muted,
    margin: "10px 0 0",
    fontFamily: FONT_STACK,
  } as Css,
};

const toDisplayParcelList = (parcelNumbers?: string[] | null) => {
  if (!parcelNumbers || !Array.isArray(parcelNumbers)) return [];
  const list = parcelNumbers
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(list));
};

const resolveBrand = (brand?: GlsShipmentCreatedEmailProps["brand"]) => ({
  name: brand?.name ?? BRAND_DEFAULT.name,
  domain: brand?.domain ?? BRAND_DEFAULT.domain,
  websiteUrl: brand?.websiteUrl ?? BRAND_DEFAULT.websiteUrl,
  logoUrl: brand?.logoUrl ?? BRAND_DEFAULT.logoUrl,
  logoAlt: brand?.logoAlt ?? BRAND_DEFAULT.logoAlt,
});

const buildBlocks = (): Record<LanguageCode, LanguageBlock> => ({
  hu: {
    code: "hu",
    locale: "hu-HU",
    preview: (id) => `GLS csomag létrehozva: ${id}`,
    heading: "GLS csomag létrehozva",
    intro: (name, id) => (
      <>
        Szia {name}, elkészült a GLS csomag a {id} rendeléshez. A csomagszám(ok)
        alább láthatók.
      </>
    ),
    badge: "Készen áll",
    listTitle: "Csomagszámok",
    listHint:
      "A csomagkövetés pár percen belül megjelenhet a GLS rendszerében.",
    noItemsCopy: "A csomagszám még nem érhető el. Amint elérhető, frissítjük.",
    ctaLabel: "Rendelés megtekintése",
    secondaryCtaLabel: "Ügyfélszolgálat",
    contactTitle: "Kapcsolat",
    contactCopy: (
      <>
        Írj a{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
          {CONTACT_EMAIL}
        </Link>{" "}
        címre vagy hívd a{" "}
        <Link
          href={`tel:${String(CONTACT_PHONE).replace(/\s+/g, "")}`}
          style={styles.link}
        >
          {CONTACT_PHONE}
        </Link>{" "}
        számot.
      </>
    ),
    closingLines: ["Köszönjük!", "Üdv,", "Teherguminet.hu"],
    footer: "Automatikus értesítés a GLS csomag létrehozásáról.",
    theme: LANGUAGE_THEMES.hu,
  },
  sk: {
    code: "sk",
    locale: "sk-SK",
    preview: (id) => `GLS zásielka vytvorená: ${id}`,
    heading: "GLS zásielka vytvorená",
    intro: (name, id) => (
      <>
        Ahoj {name}, pre objednávku {id} sme vytvorili GLS zásielku. Nižšie
        nájdeš čísla zásielok.
      </>
    ),
    badge: "Pripravené",
    listTitle: "Čísla zásielok",
    listHint:
      "Sledovanie môže byť dostupné v systéme GLS v priebehu pár minút.",
    noItemsCopy:
      "Číslo zásielky zatiaľ nie je dostupné. Hneď ako bude, zobrazíme ho.",
    ctaLabel: "Zobraziť objednávku",
    secondaryCtaLabel: "Podpora",
    contactTitle: "Kontakt",
    contactCopy: (
      <>
        Napíš na{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
          {CONTACT_EMAIL}
        </Link>{" "}
        alebo zavolaj na{" "}
        <Link
          href={`tel:${String(CONTACT_PHONE).replace(/\s+/g, "")}`}
          style={styles.link}
        >
          {CONTACT_PHONE}
        </Link>
        .
      </>
    ),
    closingLines: ["Ďakujeme!", "S pozdravom,", "Teherguminet.hu"],
    footer: "Automatické upozornenie o vytvorení GLS zásielky.",
    theme: LANGUAGE_THEMES.sk,
  },
});

export const GlsShipmentCreatedEmail = ({
  order,
  parcelNumbers,
  buildTrackingUrl,
  brand,
  order_url,
}: GlsShipmentCreatedEmailProps) => {
  const orderId = resolveOrderId(order);
  const customerName = resolveCustomerName(order);
  const language = resolveLanguageFromOrder(order);
  const orderUrl = order_url?.trim() || buildOrderUrl(order.id, language);
  const parcels = toDisplayParcelList(parcelNumbers);
  const blocks = buildBlocks();
  const block = blocks[language] ?? blocks.hu;
  const b = resolveBrand(brand);

  const supportHref = `mailto:${CONTACT_EMAIL}`;

  return (
    <Html lang={block.locale}>
      <Head>
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: ${TOKENS.color.darkBg} !important; }
            .card { background: ${TOKENS.color.darkCard} !important; border: ${TOKENS.border.dark} !important; box-shadow: ${TOKENS.shadow.dark} !important; }
            .text { color: ${TOKENS.color.darkText} !important; }
            .muted { color: ${TOKENS.color.darkMuted} !important; }
            .subtle { background: ${TOKENS.color.darkSubtle} !important; border: ${TOKENS.border.dark} !important; }
            a { color: ${TOKENS.color.darkLink} !important; }
            .secondary { background: rgba(255,255,255,0.06) !important; border: ${TOKENS.border.dark} !important; color: ${TOKENS.color.darkText} !important; }
          }
          @media (max-width: 520px) {
            .container { padding: 0 14px !important; }
            .header { padding: ${TOKENS.space.padSm}px ${TOKENS.space.padSm}px 12px !important; }
            .content { padding: 14px ${TOKENS.space.padSm}px ${TOKENS.space.padSm}px !important; }
            .title { font-size: 22px !important; }
          }
        `}</style>
      </Head>

      <Preview>{block.preview(orderId)}</Preview>

      <Body style={styles.body}>
        <Container style={styles.container} className="container">
          <Section style={styles.card} className="card">
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
                        <Link href={b.websiteUrl} style={styles.brandWrap}>
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
                                  <Text
                                    style={styles.brandText}
                                    className="text"
                                  >
                                    {b.name}
                                  </Text>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </Link>
                      </td>
                      <td
                        style={{
                          width: "30%",
                          textAlign: "right",
                          verticalAlign: "middle",
                        }}
                      >
                        <Text style={styles.badge}>{block.badge}</Text>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>

              <Heading style={styles.title} className="title text">
                {block.heading}
              </Heading>

              <Text style={styles.p} className="text">
                {block.intro(customerName, orderId)}
              </Text>
            </Section>

            <Hr style={styles.divider} />

            <Section style={styles.content} className="content">
              <Section style={styles.detailCard} className="subtle">
                <Text style={styles.label} className="text">
                  {block.listTitle}
                </Text>

                {parcels.length ? (
                  <>
                    {parcels.map((parcel, idx) => {
                      const isLast = idx === parcels.length - 1;
                      const trackingUrl =
                        buildTrackingUrl?.(parcel, language) ?? null;

                      return (
                        <Section
                          key={parcel}
                          style={{
                            ...styles.parcelRow,
                            borderBottom: isLast
                              ? "none"
                              : styles.parcelRow.borderBottom,
                          }}
                        >
                          <table
                            role="presentation"
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                            }}
                          >
                            <tbody>
                              <tr>
                                <td style={{ verticalAlign: "middle" }}>
                                  <Text
                                    style={styles.parcelValue}
                                    className="text"
                                  >
                                    {trackingUrl ? (
                                      <Link
                                        href={trackingUrl}
                                        style={styles.link}
                                      >
                                        {parcel}
                                      </Link>
                                    ) : (
                                      parcel
                                    )}
                                  </Text>
                                </td>
                                {trackingUrl ? (
                                  <td
                                    style={{
                                      width: "120px",
                                      textAlign: "right",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    <Text
                                      style={{
                                        ...styles.muted,
                                        fontWeight: 800,
                                      }}
                                      className="muted"
                                    >
                                      Track →
                                    </Text>
                                  </td>
                                ) : null}
                              </tr>
                            </tbody>
                          </table>
                        </Section>
                      );
                    })}

                    <Text style={styles.parcelHint} className="muted">
                      {block.listHint}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.muted} className="muted">
                    {block.noItemsCopy}
                  </Text>
                )}
              </Section>

              <Section style={styles.ctaRow}>
                <table
                  role="presentation"
                  style={{ width: "100%", borderCollapse: "collapse" }}
                >
                  <tbody>
                    <tr>
                      <td style={{ width: "52%", verticalAlign: "middle" }}>
                        <Button href={orderUrl} style={styles.ctaPrimary}>
                          {block.ctaLabel}
                        </Button>
                      </td>
                      <td
                        style={{
                          width: "48%",
                          textAlign: "right",
                          verticalAlign: "middle",
                        }}
                      >
                        <Button
                          href={supportHref}
                          style={styles.ctaSecondary}
                          className="secondary"
                        >
                          {block.secondaryCtaLabel}
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <Text
                  style={{ ...styles.muted, marginTop: "10px" }}
                  className="muted"
                >
                  {block.contactTitle}:{" "}
                  <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
                    {CONTACT_EMAIL}
                  </Link>
                  {" • "}
                  <Link
                    href={`tel:${String(CONTACT_PHONE).replace(/\s+/g, "")}`}
                    style={styles.link}
                  >
                    {CONTACT_PHONE}
                  </Link>
                </Text>
              </Section>

              <Text
                style={{ ...styles.p, marginTop: TOKENS.space.gap }}
                className="text"
              >
                {block.contactCopy}
              </Text>

              {block.closingLines.map((line) => (
                <Text
                  key={line}
                  style={{ ...styles.muted, marginTop: "10px" }}
                  className="muted"
                >
                  {line}
                </Text>
              ))}
            </Section>
          </Section>

          <Text style={styles.footer} className="muted">
            {block.footer}
          </Text>
          <Text style={styles.fineprint} className="muted">
            {b.domain}
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default GlsShipmentCreatedEmail;
