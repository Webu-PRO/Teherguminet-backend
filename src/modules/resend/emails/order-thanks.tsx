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
  formatAmount,
  prepareOrderItems,
  resolveCustomerName,
  resolveOrderId,
  type LanguageTheme,
  type OrderEmailProps,
} from "./order-email-shared";

export type OrderThanksEmailProps = OrderEmailProps;

const FONT_STACK =
  '"SF Pro Text","SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

type LanguageBlock = {
  code: LanguageCode;
  locale: string;
  languageLabel: string;
  preview: (orderId: string) => string;
  heading: (name: string) => string;
  intro: React.ReactNode;
  summaryTitle: string;
  noItemsCopy: string;
  itemFallbackLabel: string;
  metaLabels: {
    order: string;
    email: string;
    total: string;
  };
  summaryLabels: {
    subtotal: string;
    shipping: string;
    total: string;
  };
  ctaLabel: string;
  contactCopy: React.ReactNode;
  closingLines: string[];
  footer: string;
  theme: LanguageTheme;
};

const styles = {
  body: {
    backgroundColor: "#ffffff",
    margin: 0,
    padding: "36px 0",
    fontFamily: FONT_STACK,
    color: "#111111",
  } as React.CSSProperties,
  container: {
    width: "100%",
    maxWidth: "660px",
    margin: "0 auto",
    padding: "0 20px",
  } as React.CSSProperties,
  card: {
    borderRadius: "24px",
    backgroundColor: "#ffffff",
    border: "1px solid #E5E7EB",
    boxShadow: "0 16px 40px rgba(17,17,17,0.08)",
    overflow: "hidden",
  } as React.CSSProperties,
  header: {
    padding: "28px 28px 10px",
  } as React.CSSProperties,
  brand: {
    fontSize: "16px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    margin: 0,
    color: "#111111",
    textDecoration: "none",
    display: "inline-block",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  content: {
    padding: "10px 28px 28px",
  } as React.CSSProperties,
  h1: {
    fontSize: "26px",
    lineHeight: "1.15",
    fontWeight: 700,
    margin: "14px 0 10px",
    color: "#111111",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  p: {
    fontSize: "15px",
    lineHeight: "22px",
    margin: "0 0 12px",
    color: "#111111",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  muted: {
    fontSize: "13px",
    lineHeight: "20px",
    color: "#6B7280",
    margin: 0,
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  divider: {
    borderTop: "1px solid #E5E7EB",
    margin: 0,
  } as React.CSSProperties,
  metaCard: {
    borderRadius: "16px",
    padding: "14px",
    backgroundColor: "#F9FAFB",
    border: "1px solid #E5E7EB",
  } as React.CSSProperties,
  metaLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    color: "#6B7280",
    margin: "0 0 6px",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  metaValue: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#111111",
    margin: 0,
    fontFamily: FONT_STACK,
    wordBreak: "break-word",
  } as React.CSSProperties,
  summaryCard: {
    marginTop: "18px",
    padding: "18px",
    borderRadius: "16px",
    backgroundColor: "#ffffff",
    border: "1px solid #E5E7EB",
  } as React.CSSProperties,
  summaryTitle: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    fontWeight: 700,
    margin: "0 0 12px",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  itemRow: {
    padding: "10px 0",
  } as React.CSSProperties,
  itemName: {
    fontSize: "14px",
    lineHeight: "20px",
    color: "#111111",
    margin: 0,
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  itemPrice: {
    fontSize: "14px",
    lineHeight: "20px",
    color: "#111111",
    fontWeight: 700,
    margin: 0,
    fontFamily: FONT_STACK,
    textAlign: "right",
  } as React.CSSProperties,
  summaryRow: {
    padding: "4px 0",
  } as React.CSSProperties,
  ctaWrap: {
    marginTop: "18px",
  } as React.CSSProperties,
  cta: {
    backgroundColor: F1_RED,
    borderRadius: "999px",
    padding: "12px 18px",
    fontSize: "14px",
    fontWeight: 700,
    color: "#ffffff",
    textDecoration: "none",
    display: "inline-block",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  link: {
    color: "#111111",
    textDecoration: "underline",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  footer: {
    textAlign: "center",
    fontSize: "12px",
    lineHeight: "18px",
    color: "#6B7280",
    margin: "16px 0 0",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
};

const SummaryRow = ({
  label,
  value,
  accent = false,
  accentColor,
}: {
  label: string;
  value: string;
  accent?: boolean;
  accentColor: string;
}) => (
  <table
    role="presentation"
    width="100%"
    cellPadding="0"
    cellSpacing="0"
    style={{ width: "100%", borderCollapse: "collapse" }}
  >
    <tbody>
      <tr>
        <td style={{ padding: "4px 0" }}>
          <Text
            style={{
              ...styles.muted,
              color: accent ? "#111111" : "#6B7280",
              fontWeight: accent ? 700 : 600,
            }}
          >
            {label}
          </Text>
        </td>
        <td style={{ padding: "4px 0", textAlign: "right" }}>
          <Text
            style={{
              ...styles.muted,
              color: accent ? accentColor : "#111111",
              fontWeight: accent ? 800 : 700,
              textAlign: "right",
            }}
          >
            {value}
          </Text>
        </td>
      </tr>
    </tbody>
  </table>
);

export const OrderThanksEmailComponent = ({ order }: OrderThanksEmailProps) => {
  const currency = order.currency_code?.toUpperCase?.() || "EUR";
  const orderId = resolveOrderId(order);
  const customerName = resolveCustomerName(order);
  const emailDisplay = order.email?.trim() || "—";

  const totals = {
    subtotal:
      typeof order.subtotal === "number"
        ? order.subtotal
        : typeof order.item_total === "number"
          ? order.item_total
          : null,
    shipping:
      typeof order.shipping_total === "number" ? order.shipping_total : null,
    total: typeof order.total === "number" ? order.total : null,
  };

  const languageBlocks: Record<LanguageCode, LanguageBlock> = {
    hu: {
      code: "hu",
      locale: "hu-HU",
      languageLabel: "Magyar",
      preview: (id) => `Rendelési összefoglaló: ${id}`,
      heading: (name) => `Köszönjük, ${name}!`,
      intro: (
        <>
          Összekészítettük a rendelésed összefoglalóját. Az alábbi tételeket
          rögzítettük a rendelésedhez:
        </>
      ),
      summaryTitle: "Rendelési összefoglaló",
      noItemsCopy: "A rendeléshez nem tartoznak tételadatok.",
      itemFallbackLabel: "Termék",
      metaLabels: {
        order: "Azonosító",
        email: "Email",
        total: "Végösszeg",
      },
      summaryLabels: {
        subtotal: "Részösszeg",
        shipping: "Szállítás",
        total: "Fizetendő végösszeg",
      },
      ctaLabel: "Rendelés megtekintése",
      contactCopy: (
        <>
          Kérdésed van? Vedd fel velünk a kapcsolatot a{" "}
          <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
            {CONTACT_EMAIL}
          </Link>{" "}
          címen vagy a{" "}
          <Link href={`tel:${CONTACT_PHONE}`} style={styles.link}>
            {CONTACT_PHONE}
          </Link>{" "}
          telefonszámon.
        </>
      ),
      closingLines: ["Üdvözlettel,", "A Teherguminet.hu csapata"],
      footer:
        "Ez egy automatikusan generált üzenet, kérjük ne válaszolj rá közvetlenül.",
      theme: LANGUAGE_THEMES.hu,
    },
    sk: {
      code: "sk",
      locale: "sk-SK",
      languageLabel: "Slovenčina",
      preview: (id) => `Zhrnutie objednávky: ${id}`,
      heading: (name) => `Ďakujeme, ${name}!`,
      intro: (
        <>
          Pripravili sme prehľad vašej objednávky. Nižšie nájdete zhrnutie
          položiek a súm:
        </>
      ),
      summaryTitle: "Zhrnutie objednávky",
      noItemsCopy: "K objednávke momentálne nemáme položky.",
      itemFallbackLabel: "Položka",
      metaLabels: {
        order: "ID",
        email: "Email",
        total: "Celková suma",
      },
      summaryLabels: {
        subtotal: "Medzisúčet",
        shipping: "Doprava",
        total: "Celková suma",
      },
      ctaLabel: "Zobraziť objednávku",
      contactCopy: (
        <>
          Máte otázky? Kontaktujte nás na adrese{" "}
          <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
            {CONTACT_EMAIL}
          </Link>{" "}
          alebo na čísle{" "}
          <Link href={`tel:${CONTACT_PHONE}`} style={styles.link}>
            {CONTACT_PHONE}
          </Link>
          .
        </>
      ),
      closingLines: ["S pozdravom,", "Tím Teherguminet.hu"],
      footer:
        "Toto je automaticky generovaná správa, prosím, neodpovedajte na ňu.",
      theme: LANGUAGE_THEMES.sk,
    },
  };

  const languageCode = resolveLanguageFromOrder(order);
  const lang = languageBlocks[languageCode] ?? languageBlocks.hu;

  const items = prepareOrderItems(order, lang.itemFallbackLabel);
  const orderUrl = buildOrderUrl(orderId, languageCode);

  const orderTotalDisplay = formatAmount(totals.total, currency, lang.locale);
  const accentColor = lang.code === "hu" ? "#E10600" : "#4DA3FF";
  const ctaBg =
    typeof lang.theme?.ctaBackground === "string"
      ? lang.theme.ctaBackground
      : "#111111";

  return (
    <Html>
      <Head />
      <Preview>{lang.preview(orderId)}</Preview>

      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            {/* Header */}
            <Section style={styles.header}>
              <Link href="https://teherguminet.hu" style={styles.brand}>
                TEHERGUMINET.HU
              </Link>
            </Section>

            <Hr style={styles.divider} />

            {/* Content */}
            <Section style={styles.content}>
              <Heading style={styles.h1}>{lang.heading(customerName)}</Heading>
              <Text style={styles.p}>{lang.intro}</Text>

              {/* Meta (email-safe) */}
              <Section style={{ marginTop: "16px" }}>
                <table
                  role="presentation"
                  width="100%"
                  cellPadding="0"
                  cellSpacing="0"
                  style={{ width: "100%", borderCollapse: "collapse" }}
                >
                  <tbody>
                    <tr>
                      <td style={{ paddingRight: "8px", paddingBottom: "8px" }}>
                        <Section style={styles.metaCard}>
                          <Text style={styles.metaLabel}>
                            {lang.metaLabels.order}
                          </Text>
                          <Text style={styles.metaValue}>{orderId}</Text>
                        </Section>
                      </td>
                      <td style={{ paddingLeft: "8px", paddingBottom: "8px" }}>
                        <Section style={styles.metaCard}>
                          <Text style={styles.metaLabel}>
                            {lang.metaLabels.email}
                          </Text>
                          <Text style={styles.metaValue}>
                            {emailDisplay}
                          </Text>
                        </Section>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2}>
                        <Section style={styles.metaCard}>
                          <Text style={styles.metaLabel}>
                            {lang.metaLabels.total}
                          </Text>
                          <Text style={styles.metaValue}>
                            {orderTotalDisplay}
                          </Text>
                        </Section>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>

              {/* Summary */}
              <Section style={styles.summaryCard}>
                <Text style={{ ...styles.summaryTitle, color: accentColor }}>
                  {lang.summaryTitle}
                </Text>

                {items.length ? (
                  <>
                    {items.map((item, idx) => (
                      <React.Fragment key={`${lang.code}-${item.key}`}>
                        <table
                          role="presentation"
                          width="100%"
                          cellPadding="0"
                          cellSpacing="0"
                          style={{ width: "100%", borderCollapse: "collapse" }}
                        >
                          <tbody>
                            <tr>
                              <td style={{ padding: "10px 0" }}>
                                <Text style={styles.itemName}>
                                  {item.quantity}× {item.name}
                                </Text>
                              </td>
                              <td style={{ padding: "10px 0" }}>
                                <Text style={styles.itemPrice}>
                                  {formatAmount(
                                    item.price,
                                    currency,
                                    lang.locale
                                  )}
                                </Text>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        {idx < items.length - 1 ? (
                          <Hr
                            style={{
                              borderTop: "1px solid #E5E7EB",
                              margin: 0,
                            }}
                          />
                        ) : null}
                      </React.Fragment>
                    ))}
                  </>
                ) : (
                  <Text style={{ ...styles.muted, margin: 0 }}>
                    {lang.noItemsCopy}
                  </Text>
                )}

                <Hr
                  style={{ borderTop: "1px solid #E5E7EB", margin: "14px 0" }}
                />

                <SummaryRow
                  label={lang.summaryLabels.subtotal}
                  value={formatAmount(totals.subtotal, currency, lang.locale)}
                  accentColor={accentColor}
                />
                <SummaryRow
                  label={lang.summaryLabels.shipping}
                  value={formatAmount(totals.shipping, currency, lang.locale)}
                  accentColor={accentColor}
                />
                <SummaryRow
                  label={lang.summaryLabels.total}
                  value={formatAmount(totals.total, currency, lang.locale)}
                  accent
                  accentColor={accentColor}
                />
              </Section>

              {/* CTA */}
              <Section style={styles.ctaWrap}>
                <Button
                  href={orderUrl}
                  style={{ ...styles.cta, backgroundColor: ctaBg }}
                >
                  {lang.ctaLabel}
                </Button>

                <Text style={{ ...styles.muted, marginTop: "10px" }}>
                  {lang.code === "hu"
                    ? "Ha a gomb nem működik:"
                    : "Ak tlačidlo nefunguje:"}{" "}
                  <Link href={orderUrl} style={styles.link}>
                    {orderUrl}
                  </Link>
                </Text>
              </Section>

              {/* Contact + Closing */}
              <Text style={{ ...styles.p, marginTop: "12px" }}>
                {lang.contactCopy}
              </Text>

              <Text style={{ ...styles.p, marginTop: "10px" }}>
                {lang.closingLines.map((line, index) => (
                  <React.Fragment key={`${lang.code}-closing-${index}`}>
                    {line}
                    {index < lang.closingLines.length - 1 ? <br /> : null}
                  </React.Fragment>
                ))}
              </Text>
            </Section>
          </Section>

          <Text style={styles.footer}>{lang.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const mockOrderThanks: OrderThanksEmailProps = {
  order: {
    id: "order_01JSNXDH9BPJWWKVW03B9E9KW8",
    display_id: 1,
    email: "partner@teherguminet.hu",
    currency_code: "eur",
    total: 2830,
    subtotal: 2830,
    shipping_total: 0,
    item_total: 2830,
    customer: {
      first_name: "Partner",
    },
    shipping_address: {
      first_name: "Partner",
      last_name: "Teszt",
    },
    items: [
      {
        id: "ordli_01JSNXDH9C47KZ43WQ3TBFXZA9",
        title: "Michelin X Multi Z 315/80 R22.5",
        quantity: 4,
        total: 1870,
      },
      {
        id: "ordli_01JSNXDH9C47KZ43WQ3TBFXZA8",
        title: "Continental Hybrid HS3 385/65 R22.5",
        quantity: 2,
        total: 960,
      },
    ],
  },
};
