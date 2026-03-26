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
  INVOICE_COMPANY_DETAILS,
  LANGUAGE_THEMES,
  buildOrderUrl,
  formatAmount,
  resolveCustomerName,
  resolveOrderId,
  type LanguageTheme,
  type OrderEmailProps,
} from "./order-email-shared";

export type OrderPlacedEmailProps = OrderEmailProps;

const FONT_STACK =
  '"Helvetica Neue",Helvetica,Arial,"Nimbus Sans L",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';

type LanguageBlock = {
  code: LanguageCode;
  locale: string;
  languageLabel: string;
  preview: (orderId: string) => string;
  heading: string;
  intro: (name: string, orderId: string) => React.ReactNode;
  metaLabels: {
    order: string;
    email: string;
    total: string;
  };
  statusTitle: string;
  statusCopy: string;
  receiptTitle: string;
  receiptCopy: string;
  receiptCta: string;
  ctaLabel: string;
  contactCopy: React.ReactNode;
  closingLines: string[];
  footer: string;
  theme: LanguageTheme;
};

const baseStyles = {
  body: {
    backgroundColor: "#eeeeee",
    margin: 0,
    padding: "20px 0",
    fontFamily: FONT_STACK,
    color: "#111111",
  } as React.CSSProperties,
  container: {
    width: "100%",
    maxWidth: "640px",
    margin: "0 auto",
    padding: "0 14px",
  } as React.CSSProperties,
  card: {
    borderRadius: "6px",
    backgroundColor: "#ffffff",
    border: "1px solid #dedede",
    overflow: "hidden",
  } as React.CSSProperties,
  header: {
    padding: "20px 28px 14px",
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #F3F4F6",
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
  } as React.CSSProperties,
  content: {
    padding: "10px 28px 28px",
  } as React.CSSProperties,
  h1: {
    fontSize: "28px",
    lineHeight: "1.15",
    fontWeight: 700,
    margin: "14px 0 10px",
    color: "#111111",
  } as React.CSSProperties,
  p: {
    fontSize: "15px",
    lineHeight: "22px",
    margin: "0 0 12px",
    color: "#111111",
  } as React.CSSProperties,
  muted: {
    fontSize: "13px",
    lineHeight: "20px",
    color: "#6B7280",
    margin: 0,
  } as React.CSSProperties,
  divider: {
    borderTop: "1px solid #E5E7EB",
    margin: 0,
  } as React.CSSProperties,
  metaGrid: {
    marginTop: "18px",
  } as React.CSSProperties,
  metaCard: {
    borderRadius: "16px",
    padding: "14px 14px",
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
  } as React.CSSProperties,
  statusCard: {
    marginTop: "18px",
    padding: "16px",
    borderRadius: "16px",
    backgroundColor: "#ffffff",
    border: "1px solid #E5E7EB",
  } as React.CSSProperties,
  statusTitle: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    fontWeight: 700,
    margin: "0 0 10px",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  receiptCard: {
    marginTop: "18px",
    padding: "16px",
    borderRadius: "16px",
    backgroundColor: "#111111",
    border: "1px solid #1F2937",
  } as React.CSSProperties,
  receiptTitle: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    fontWeight: 800,
    margin: "0 0 10px",
    color: "#111111",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  receiptText: {
    color: "#F3F4F6",
  } as React.CSSProperties,
  receiptMuted: {
    color: "#D1D5DB",
  } as React.CSSProperties,
  receiptLink: {
    color: "#111111",
    textDecoration: "underline",
  } as React.CSSProperties,
  bankCard: {
    marginTop: "18px",
    padding: "16px",
    borderRadius: "16px",
    backgroundColor: "#ffffff",
    border: "1px solid #E5E7EB",
  } as React.CSSProperties,
  bankTitle: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    fontWeight: 800,
    margin: "0 0 10px",
    color: "#111111",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  bankLabel: {
    margin: 0,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#6B7280",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  bankValue: {
    margin: "4px 0 0",
    fontSize: "14px",
    lineHeight: "20px",
    color: "#111111",
    fontWeight: 700,
    fontFamily: FONT_STACK,
    wordBreak: "break-word",
  } as React.CSSProperties,
  ctaWrap: {
    marginTop: "18px",
    textAlign: "left",
  } as React.CSSProperties,
  cta: {
    backgroundColor: F1_RED,
    borderRadius: "4px",
    border: "1px solid #b70500",
    padding: "12px 18px",
    fontSize: "14px",
    fontWeight: 700,
    color: "#ffffff",
    textDecoration: "none",
    display: "inline-block",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  secondaryLink: {
    color: "#111111",
    textDecoration: "underline",
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

const resolveBillingoPublicUrl = (
  metadata?: Record<string, unknown> | null
) => {
  const candidates: Array<unknown> = [
    metadata?.billingo_invoice,
    metadata?.billingo_invoice_public_url,
    metadata?.billingo_receipt,
    metadata?.billingo_receipt_public_url,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim()
      if (trimmed) {
        return trimmed
      }
    }

    if (candidate && typeof candidate === "object") {
      const url = (candidate as { public_url?: unknown }).public_url
      if (typeof url === "string") {
        const trimmed = url.trim()
        if (trimmed) {
          return trimmed
        }
      }
    }
  }

  return ""
};

const resolveBillingoInvoiceNumber = (
  metadata?: Record<string, unknown> | null
) => {
  const invoice = metadata?.billingo_invoice;
  if (invoice && typeof invoice === "object") {
    const invoiceNumber = (invoice as { invoice_number?: unknown })
      .invoice_number;
    if (typeof invoiceNumber === "string") {
      const trimmed = invoiceNumber.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return "";
};

export const OrderPlacedEmailComponent = ({ order }: OrderPlacedEmailProps) => {
  const currency = order.currency_code?.toUpperCase?.() || "EUR";
  const orderId = resolveOrderId(order);
  const customerName = resolveCustomerName(order);
  const orderTotal =
    typeof order.total === "number" && !Number.isNaN(order.total)
      ? order.total
      : null;
  const emailDisplay = order.email?.trim() || "—";

  const languageBlocks: Record<LanguageCode, LanguageBlock> = {
    hu: {
      code: "hu",
      locale: "hu-HU",
      languageLabel: "Magyar",
      preview: (id) => `Rendelés visszaigazolása: ${id}`,
      heading: "Rendelés visszaigazolva",
      intro: (name, id) => (
        <>
          Kedves {name}, megerősítjük, hogy a{" "}
          <strong style={{ color: "#111111" }}>{id}</strong> számú rendelésedet
          rögzítettük. Amint összekészítettük az abroncsokat a raktárunkban,
          külön e-mailben értesítünk a kiszállítás részleteiről.
        </>
      ),
      metaLabels: {
        order: "Azonosító",
        email: "Email",
        total: "Végösszeg",
      },
      statusTitle: "Rendelési állapot",
      statusCopy:
        "A rendelés aktuális állapotát bármikor ellenőrizheted az alábbi gombra kattintva:",
      receiptTitle: "Számla",
      receiptCopy:
        "A rendelésedhez elkészült a számla. Az alábbi gombra kattintva letöltheted a PDF-et:",
      receiptCta: "Számla letöltése",
      ctaLabel: "Rendelés megtekintése",
      contactCopy: (
        <>
          Kérdésed van? Vedd fel velünk a kapcsolatot a{" "}
          <Link
            href={`mailto:${CONTACT_EMAIL}`}
            style={{
              color: "#111111",
              fontWeight: 700,
              textDecoration: "underline",
            }}
          >
            {CONTACT_EMAIL}
          </Link>{" "}
          címen vagy a{" "}
          <Link
            href={`tel:${CONTACT_PHONE}`}
            style={{
              color: "#111111",
              fontWeight: 700,
              textDecoration: "underline",
            }}
          >
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
      preview: (id) => `Potvrdenie objednávky: ${id}`,
      heading: "Objednávka potvrdená",
      intro: (name, id) => (
        <>
          Dobrý deň, {name}! Potvrdzujeme prijatie objednávky{" "}
          <strong style={{ color: "#111111" }}>{id}</strong>. Keď pripravíme
          pneumatiky v sklade, pošleme vám ďalší e-mail s detailmi doručenia.
        </>
      ),
      metaLabels: {
        order: "ID",
        email: "Email",
        total: "Celková suma",
      },
      statusTitle: "Stav objednávky",
      statusCopy:
        "Aktuálny stav objednávky si môžete kedykoľvek pozrieť kliknutím na tlačidlo nižšie:",
      receiptTitle: "Faktúra",
      receiptCopy:
        "K objednávke bola vystavená faktúra. PDF si môžete stiahnuť kliknutím na tlačidlo:",
      receiptCta: "Stiahnuť faktúru",
      ctaLabel: "Zobraziť objednávku",
      contactCopy: (
        <>
          Máte otázky? Kontaktujte nás na adrese{" "}
          <Link
            href={`mailto:${CONTACT_EMAIL}`}
            style={{
              color: "#111111",
              fontWeight: 700,
              textDecoration: "underline",
            }}
          >
            {CONTACT_EMAIL}
          </Link>{" "}
          alebo na čísle{" "}
          <Link
            href={`tel:${CONTACT_PHONE}`}
            style={{
              color: "#111111",
              fontWeight: 700,
              textDecoration: "underline",
            }}
          >
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

  const orderUrl = buildOrderUrl(orderId, languageCode);
  const orderTotalDisplay = formatAmount(orderTotal, currency, lang.locale);
  const receiptUrl = resolveBillingoPublicUrl(
    order.metadata as Record<string, unknown> | null
  )
  const invoiceNumber = resolveBillingoInvoiceNumber(
    order.metadata as Record<string, unknown> | null
  );

  // Accent: keep your existing per-language accent (but on white)
  const accent =
    lang.code === "hu" ? lang.theme.ctaBackground : lang.theme.ctaBackground; // fallback to theme
  const statusAccent = lang.code === "hu" ? "#E10600" : "#4DA3FF";

  return (
    <Html>
      <Head />
      <Preview>{lang.preview(orderId)}</Preview>

      <Body style={baseStyles.body}>
        <Container style={baseStyles.container}>
          <Section style={baseStyles.card}>
            {/* Header */}
            <Section style={baseStyles.header}>
              <Link href="https://teherguminet.hu" style={baseStyles.brand}>
                TEHERGUMINET.HU
              </Link>
            </Section>

            <Hr style={{ ...baseStyles.divider, borderTop: "none" }} />

            {/* Content */}
            <Section style={baseStyles.content}>
              <Heading style={baseStyles.h1}>{lang.heading}</Heading>
              <Text style={baseStyles.p}>
                {lang.intro(customerName, orderId)}
              </Text>

              {/* Meta grid (table layout for email clients) */}
              <Section style={baseStyles.metaGrid}>
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
                        <Section style={baseStyles.metaCard}>
                          <Text style={baseStyles.metaLabel}>
                            {lang.metaLabels.order}
                          </Text>
                          <Text style={baseStyles.metaValue}>{orderId}</Text>
                        </Section>
                      </td>
                      <td style={{ paddingLeft: "8px", paddingBottom: "8px" }}>
                        <Section style={baseStyles.metaCard}>
                          <Text style={baseStyles.metaLabel}>
                            {lang.metaLabels.email}
                          </Text>
                          <Text style={baseStyles.metaValue}>
                            {emailDisplay}
                          </Text>
                        </Section>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2}>
                        <Section style={baseStyles.metaCard}>
                          <Text style={baseStyles.metaLabel}>
                            {lang.metaLabels.total}
                          </Text>
                          <Text style={baseStyles.metaValue}>
                            {orderTotalDisplay}
                          </Text>
                        </Section>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>

              {/* Status */}
              <Section style={baseStyles.statusCard}>
                <Text
                  style={{ ...baseStyles.statusTitle, color: statusAccent }}
                >
                  {lang.statusTitle}
                </Text>
                <Text style={{ ...baseStyles.p, margin: 0, color: "#111111" }}>
                  {lang.statusCopy}
                </Text>
              </Section>

              {receiptUrl ? (
                <Section style={baseStyles.receiptCard}>
                  <Text style={baseStyles.receiptTitle}>
                    {lang.receiptTitle}
                  </Text>
                  <Text style={{ ...baseStyles.p, ...baseStyles.receiptText, margin: 0 }}>
                    {lang.receiptCopy}
                  </Text>
                  <Section style={{ marginTop: "12px" }}>
                    <Button href={receiptUrl} style={baseStyles.cta}>
                      {lang.receiptCta}
                    </Button>
                    <Text
                      style={{
                        ...baseStyles.muted,
                        ...baseStyles.receiptMuted,
                        marginTop: "10px",
                      }}
                    >
                      {lang.code === "hu"
                        ? "Ha a gomb nem működik, nyisd meg ezt:"
                        : "Ak tlačidlo nefunguje, otvorte tento odkaz:"}{" "}
                      <Link href={receiptUrl} style={baseStyles.receiptLink}>
                        {receiptUrl}
                      </Link>
                    </Text>
                  </Section>
                </Section>
              ) : null}

              <Section style={baseStyles.bankCard}>
                <Text style={baseStyles.bankTitle}>
                  {lang.code === "hu"
                    ? "Banki átutalási adatok"
                    : "Bankove udaje na prevod"}
                </Text>
                <Text style={{ ...baseStyles.p, margin: "0 0 12px" }}>
                  {lang.code === "hu"
                    ? "A számla kiegyenlítéséhez használd az alábbi adatokat."
                    : "Na uhradu faktury pouzite prosim nasledujuce udaje."}
                </Text>
                <Text style={{ ...baseStyles.bankValue, marginTop: 0 }}>
                  {INVOICE_COMPANY_DETAILS.companyName}
                </Text>
                <Text style={{ ...baseStyles.muted, marginTop: "6px" }}>
                  {INVOICE_COMPANY_DETAILS.city}, {INVOICE_COMPANY_DETAILS.street}
                  <br />
                  {INVOICE_COMPANY_DETAILS.postCode},{" "}
                  {INVOICE_COMPANY_DETAILS.country}
                </Text>

                <table
                  role="presentation"
                  width="100%"
                  cellPadding="0"
                  cellSpacing="0"
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    marginTop: "12px",
                  }}
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: "6px 0 4px" }}>
                        <Text style={baseStyles.bankLabel}>Adoszam</Text>
                        <Text style={baseStyles.bankValue}>
                          {INVOICE_COMPANY_DETAILS.taxNumber}
                        </Text>
                      </td>
                      <td style={{ padding: "6px 0 4px" }}>
                        <Text style={baseStyles.bankLabel}>Cegjegyzekszam</Text>
                        <Text style={baseStyles.bankValue}>
                          {INVOICE_COMPANY_DETAILS.registryNumber}
                        </Text>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "6px 0 4px" }}>
                        <Text style={baseStyles.bankLabel}>EU adoszam</Text>
                        <Text style={baseStyles.bankValue}>
                          {INVOICE_COMPANY_DETAILS.euTaxNumber}
                        </Text>
                      </td>
                      <td style={{ padding: "6px 0 4px" }}>
                        <Text style={baseStyles.bankLabel}>Bank neve</Text>
                        <Text style={baseStyles.bankValue}>
                          {INVOICE_COMPANY_DETAILS.bankName}
                        </Text>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} style={{ padding: "6px 0 4px" }}>
                        <Text style={baseStyles.bankLabel}>Bankszamlaszam</Text>
                        <Text style={baseStyles.bankValue}>
                          {INVOICE_COMPANY_DETAILS.bankAccount}
                        </Text>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "6px 0 4px" }}>
                        <Text style={baseStyles.bankLabel}>IBAN</Text>
                        <Text style={baseStyles.bankValue}>
                          {INVOICE_COMPANY_DETAILS.iban}
                        </Text>
                      </td>
                      <td style={{ padding: "6px 0 4px" }}>
                        <Text style={baseStyles.bankLabel}>SWIFT/BIC</Text>
                        <Text style={baseStyles.bankValue}>
                          {INVOICE_COMPANY_DETAILS.swift}
                        </Text>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} style={{ padding: "6px 0 0" }}>
                        <Text style={baseStyles.bankLabel}>
                          {lang.code === "hu"
                            ? "Kozlemenyben add meg"
                            : "Do poznamky uvedte"}
                        </Text>
                        <Text style={baseStyles.bankValue}>
                          {invoiceNumber || orderId}
                        </Text>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>

              {/* CTA */}
              <Section style={baseStyles.ctaWrap}>
                <Button
                  href={orderUrl}
                  style={{
                    ...baseStyles.cta,
                    backgroundColor:
                      typeof accent === "string" ? accent : "#111111",
                  }}
                >
                  {lang.ctaLabel}
                </Button>

                <Text style={{ ...baseStyles.muted, marginTop: "10px" }}>
                  {lang.code === "hu"
                    ? "Ha a gomb nem működik, nyisd meg ezt:"
                    : "Ak tlačidlo nefunguje, otvorte tento odkaz:"}{" "}
                  <Link href={orderUrl} style={baseStyles.secondaryLink}>
                    {orderUrl}
                  </Link>
                </Text>
              </Section>

              {/* Contact */}
              <Section style={{ marginTop: "14px" }}>
                <Text style={baseStyles.p}>{lang.contactCopy}</Text>
              </Section>

              {/* Closing */}
              <Text style={{ ...baseStyles.p, marginTop: "10px" }}>
                {lang.closingLines.map((line, idx) => (
                  <React.Fragment key={`${lang.code}-closing-${idx}`}>
                    {line}
                    {idx < lang.closingLines.length - 1 ? <br /> : null}
                  </React.Fragment>
                ))}
              </Text>
            </Section>
          </Section>

          {/* Footer */}
          <Text style={baseStyles.footer}>{lang.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const mockOrder: OrderPlacedEmailProps = {
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

export default () => <OrderPlacedEmailComponent {...mockOrder} />;
