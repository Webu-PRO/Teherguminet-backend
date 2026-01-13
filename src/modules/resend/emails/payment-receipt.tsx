import * as React from "react";
import {
  Body,
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

type PaymentSummary = {
  id?: string | null;
  amount?: number | string | null;
  currency_code?: string | null;
  provider_id?: string | null;
  captured_at?: Date | string | null;
};

type OrderAddress =
  | ({
      first_name?: string | null;
      last_name?: string | null;
      country_code?: string | null;
      [key: string]: unknown;
    } & Record<string, unknown>)
  | null;

type OrderItem = {
  id?: string | null;
  title?: string | null;
  product_title?: string | null;
  quantity?: number | null;
  total?: number | null;
  unit_price?: number | null;
  [key: string]: unknown;
};

type OrderCustomer = {
  first_name?: string | null;
  [key: string]: unknown;
} | null;

export type PaymentReceiptEmailProps = {
  payment?: PaymentSummary | null;
  order?: {
    id: string;
    display_id?: number | string | null;
    email?: string | null;
    metadata?: Record<string, unknown> | null;
    currency_code?: string | null;
    total?: number | null;
    subtotal?: number | null;
    shipping_total?: number | null;
    item_total?: number | null;
    shipping_address?: OrderAddress;
    billing_address?: OrderAddress;
    items?: OrderItem[];
    customer?: OrderCustomer;
    [key: string]: unknown;
  } | null;
};

const BRAND = "Teherguminet.hu";
const FONT_STACK =
  '"SF Pro Text","SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

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
    maxWidth: "680px",
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
    padding: "28px 28px 16px",
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
  title: {
    margin: "12px 0 0",
    fontSize: "26px",
    lineHeight: "1.15",
    fontWeight: 700,
    color: "#111111",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  subtitle: {
    margin: "10px 0 0",
    fontSize: "14px",
    lineHeight: "20px",
    color: "#6B7280",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  divider: {
    borderTop: "1px solid #E5E7EB",
    margin: 0,
  } as React.CSSProperties,
  content: {
    padding: "18px 28px 28px",
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
    fontSize: "14px",
    fontWeight: 800,
    color: "#111111",
    margin: 0,
    fontFamily: FONT_STACK,
    wordBreak: "break-word",
  } as React.CSSProperties,
  sectionCard: {
    marginTop: "18px",
    borderRadius: "16px",
    border: "1px solid #E5E7EB",
    backgroundColor: "#ffffff",
    padding: "18px",
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    fontWeight: 800,
    margin: "0 0 12px",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  rowLabel: {
    margin: 0,
    fontSize: "14px",
    lineHeight: "20px",
    color: "#111111",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  rowValue: {
    margin: 0,
    fontSize: "14px",
    lineHeight: "20px",
    color: "#111111",
    fontWeight: 800,
    textAlign: "right",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  muted: {
    margin: 0,
    fontSize: "12px",
    lineHeight: "18px",
    color: "#6B7280",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  note: {
    margin: "14px 0 0",
    fontSize: "14px",
    lineHeight: "20px",
    color: "#111111",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  closing: {
    margin: "12px 0 0",
    fontSize: "14px",
    lineHeight: "20px",
    color: "#111111",
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

const formatAmount = (
  value: number | string | null | undefined,
  currencyCode: string | null | undefined,
  locale: string = "hu-HU"
) => {
  if (value === null || value === undefined) return "—";

  const numericValue =
    typeof value === "string" ? Number.parseFloat(value) : Number(value);

  if (!Number.isFinite(numericValue)) return "—";

  const currency = currencyCode?.toUpperCase?.() || "EUR";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numericValue);
  } catch {
    return `${numericValue.toFixed(2)} ${currency}`;
  }
};

const resolveOrderId = (
  order?: PaymentReceiptEmailProps["order"],
  fallbackLabel = "Order"
) => {
  if (!order) return fallbackLabel;

  const displayId = order.display_id;
  if (typeof displayId === "number" && Number.isFinite(displayId)) {
    return `TG-${displayId.toString().padStart(6, "0")}`;
  }
  if (typeof displayId === "string" && displayId.trim().length) {
    return displayId.trim();
  }
  return order.id || fallbackLabel;
};

const resolveName = (order?: PaymentReceiptEmailProps["order"]) =>
  order?.customer?.first_name?.trim() ||
  order?.shipping_address?.first_name?.trim() ||
  "Partner";

const prepareItems = (
  order?: PaymentReceiptEmailProps["order"],
  fallbackLabel = "Item"
) => {
  const items = Array.isArray(order?.items) ? order?.items : [];
  return items.map((item, index) => {
    const fallback = fallbackLabel.trim() || "Item";
    const name =
      item.product_title?.trim() ||
      item.title?.trim() ||
      `${fallback} ${index + 1}`;
    const qty =
      typeof item.quantity === "number" && !Number.isNaN(item.quantity)
        ? item.quantity
        : 1;
    const price =
      typeof item.total === "number"
        ? item.total
        : typeof item.unit_price === "number"
          ? item.unit_price
          : null;

    return {
      key: item.id ?? `${name}-${index}`,
      name,
      quantity: qty,
      price,
    };
  });
};

type LanguageBlock = {
  code: LanguageCode;
  locale: string;
  preview: string;
  heading: string;
  intro: (name: string) => React.ReactNode;
  labels: {
    order: string;
    amount: string;
    date: string;
    method: string;
  };
  itemsHeading: string;
  noItemsCopy: string;
  itemFallbackLabel: string;
  summaryLabels: {
    subtotal: string;
    shipping: string;
    total: string;
  };
  note: string;
  closingLines: string[];
  orderFallback: string;
  dateFallback: string;
  accent: string;
};

const languageBlocks: Record<LanguageCode, LanguageBlock> = {
  hu: {
    code: "hu",
    locale: "hu-HU",
    preview: "Fizetési bizonylat",
    heading: "Fizetési visszaigazolás",
    intro: (name) => (
      <>
        Köszönjük a vásárlást, {name}! Az alábbiakban megtalálod a sikeres
        fizetés részleteit.
      </>
    ),
    labels: {
      order: "Rendelés",
      amount: "Fizetett összeg",
      date: "Dátum",
      method: "Fizetési mód",
    },
    itemsHeading: "Tételrészletek",
    noItemsCopy: "A rendeléshez nem tartoznak tételadatok.",
    itemFallbackLabel: "Tétel",
    summaryLabels: {
      subtotal: "Részösszeg",
      shipping: "Szállítás",
      total: "Fizetendő",
    },
    note: "A bizonylatot e-mailben őrizd meg. Ha ÁFA-s számlára van szükség, jelezd nekünk válasz e-mailben, és elkészítjük.",
    closingLines: ["Üdvözlettel,", `A ${BRAND} csapata`],
    orderFallback: "Rendelés",
    dateFallback: "Frissen feldolgozva",
    accent: "#E10600",
  },
  sk: {
    code: "sk",
    locale: "sk-SK",
    preview: "Potvrdenie platby",
    heading: "Potvrdenie platby",
    intro: (name) => (
      <>
        Ďakujeme za nákup, {name}! Nižšie nájdete podrobnosti o úspešnej platbe.
      </>
    ),
    labels: {
      order: "Objednávka",
      amount: "Zaplatená suma",
      date: "Dátum",
      method: "Spôsob platby",
    },
    itemsHeading: "Položky objednávky",
    noItemsCopy: "K objednávke momentálne nemáme položky.",
    itemFallbackLabel: "Položka",
    summaryLabels: {
      subtotal: "Medzisúčet",
      shipping: "Doprava",
      total: "Celková suma",
    },
    note: "Potvrdenie si, prosím, uchovajte. Ak potrebujete faktúru s DPH, odpovedzte na tento e-mail a pripravíme ju.",
    closingLines: ["S pozdravom,", `Tím ${BRAND}`],
    orderFallback: "Objednávka",
    dateFallback: "Práve spracované",
    accent: "#3F8DFF",
  },
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
              fontWeight: 700,
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
              fontWeight: accent ? 900 : 800,
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

export const PaymentReceiptEmail = ({
  payment,
  order,
}: PaymentReceiptEmailProps) => {
  const languageCode = resolveLanguageFromOrder(order ?? null);
  const lang = languageBlocks[languageCode] ?? languageBlocks.hu;

  const orderId = resolveOrderId(order, lang.orderFallback);
  const customerName = resolveName(order);
  const currency = order?.currency_code || payment?.currency_code || "EUR";

  const items = prepareItems(order, lang.itemFallbackLabel);

  const paymentAmount =
    payment?.amount !== undefined && payment?.amount !== null
      ? payment.amount
      : order?.total;

  const captured = payment?.captured_at ? new Date(payment.captured_at) : null;
  const paymentDate = captured
    ? captured.toLocaleString(lang.locale)
    : lang.dateFallback;

  const totals = {
    subtotal:
      typeof order?.subtotal === "number"
        ? order.subtotal
        : typeof order?.item_total === "number"
          ? order.item_total
          : null,
    shipping:
      typeof order?.shipping_total === "number" ? order.shipping_total : null,
    total:
      typeof order?.total === "number" && !Number.isNaN(order.total)
        ? order.total
        : paymentAmount,
  };

  return (
    <Html>
      <Head />
      <Preview>
        {lang.preview} · {orderId}
      </Preview>

      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            {/* Header */}
            <Section style={styles.header}>
              <Link href="https://teherguminet.hu" style={styles.brand}>
                {BRAND.toUpperCase()}
              </Link>
              <Heading style={styles.title}>{lang.heading}</Heading>
              <Text style={styles.subtitle}>{lang.intro(customerName)}</Text>
            </Section>

            <Hr style={styles.divider} />

            <Section style={styles.content}>
              {/* Meta (table layout for email clients) */}
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
                        <Text style={styles.metaLabel}>{lang.labels.order}</Text>
                        <Text style={styles.metaValue}>{orderId}</Text>
                      </Section>
                    </td>
                    <td style={{ paddingLeft: "8px", paddingBottom: "8px" }}>
                      <Section style={styles.metaCard}>
                        <Text style={styles.metaLabel}>
                          {lang.labels.amount}
                        </Text>
                        <Text style={styles.metaValue}>
                          {formatAmount(paymentAmount, currency, lang.locale)}
                        </Text>
                      </Section>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: "8px", paddingBottom: "8px" }}>
                      <Section style={styles.metaCard}>
                        <Text style={styles.metaLabel}>{lang.labels.date}</Text>
                        <Text style={styles.metaValue}>{paymentDate}</Text>
                      </Section>
                    </td>
                    <td style={{ paddingLeft: "8px", paddingBottom: "8px" }}>
                      <Section style={styles.metaCard}>
                        <Text style={styles.metaLabel}>{lang.labels.method}</Text>
                        <Text style={styles.metaValue}>
                          {payment?.provider_id?.toUpperCase?.() || "Stripe"}
                        </Text>
                      </Section>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Items + Summary */}
              <Section style={styles.sectionCard}>
                <Text style={{ ...styles.sectionTitle, color: lang.accent }}>
                  {lang.itemsHeading}
                </Text>

                {items.length ? (
                  <>
                    {items.map((item, idx) => (
                      <React.Fragment key={item.key}>
                        <table
                          role="presentation"
                          width="100%"
                          cellPadding="0"
                          cellSpacing="0"
                          style={{ width: "100%", borderCollapse: "collapse" }}
                        >
                          <tbody>
                            <tr>
                              <td style={{ padding: "8px 0" }}>
                                <Text style={styles.rowLabel}>
                                  {item.quantity}× {item.name}
                                </Text>
                              </td>
                              <td style={{ padding: "8px 0" }}>
                                <Text style={styles.rowValue}>
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
                  accentColor={lang.accent}
                />
                <SummaryRow
                  label={lang.summaryLabels.shipping}
                  value={formatAmount(totals.shipping, currency, lang.locale)}
                  accentColor={lang.accent}
                />
                <SummaryRow
                  accent
                  label={lang.summaryLabels.total}
                  value={formatAmount(totals.total, currency, lang.locale)}
                  accentColor={lang.accent}
                />
              </Section>

              {/* Note + Closing */}
              <Text style={styles.note}>{lang.note}</Text>
              <Text style={styles.closing}>
                {lang.closingLines.map((line, index) => (
                  <React.Fragment key={`${lang.code}-closing-${index}`}>
                    {line}
                    {index < lang.closingLines.length - 1 ? <br /> : null}
                  </React.Fragment>
                ))}
              </Text>
            </Section>
          </Section>

          <Text style={styles.footer}>
            {lang.code === "hu"
              ? "Ez egy automatikusan generált üzenet, kérjük ne válaszolj rá közvetlenül."
              : "Toto je automaticky generovaná správa, prosím, neodpovedajte na ňu."}
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export const mockPaymentReceipt: PaymentReceiptEmailProps = {
  payment: {
    id: "pay_123",
    amount: 2830,
    currency_code: "EUR",
    provider_id: "stripe",
    captured_at: new Date().toISOString(),
  },
  order: {
    id: "order_123",
    display_id: 1,
    email: "partner@teherguminet.hu",
    currency_code: "eur",
    subtotal: 2600,
    shipping_total: 230,
    total: 2830,
    customer: {
      first_name: "Partner",
    },
    shipping_address: {
      first_name: "Partner",
      last_name: "Teszt",
    },
    items: [
      {
        id: "item_1",
        title: "Michelin X Multi Z 315/80 R22.5",
        quantity: 4,
        total: 1870,
      },
      {
        id: "item_2",
        title: "Continental Hybrid HS3 385/65 R22.5",
        quantity: 2,
        total: 960,
      },
    ],
  },
};
