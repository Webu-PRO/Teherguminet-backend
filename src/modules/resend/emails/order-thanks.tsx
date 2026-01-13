import * as React from "react"
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import {
  LanguageCode,
  resolveLanguageFromOrder,
} from "../email-language"
import {
  CONTACT_EMAIL,
  CONTACT_PHONE,
  F1_RED,
  LANGUAGE_THEMES,
  PANEL_BG,
  TEXT_LIGHT,
  buildOrderUrl,
  formatAmount,
  prepareOrderItems,
  resolveCustomerName,
  resolveOrderId,
  type LanguageTheme,
  type OrderEmailProps,
} from "./order-email-shared"

export type OrderThanksEmailProps = OrderEmailProps

const sectionStyle: React.CSSProperties = {
  borderRadius: "22px",
  padding: "32px",
  background: PANEL_BG,
  color: TEXT_LIGHT,
  border: "1px solid rgba(225,6,0,0.22)",
  boxShadow: "0 20px 40px rgba(0,0,0,0.55)",
}

const containerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "640px",
  margin: "0 auto",
  padding: "0 24px",
}

const languageTagStyle: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Arial, sans-serif',
  fontSize: "11px",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  margin: "0 0 10px",
}

const textStyle: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Arial, sans-serif',
  fontSize: "15px",
  lineHeight: "22px",
  margin: "0 0 12px",
  color: TEXT_LIGHT,
}

const strongText: React.CSSProperties = {
  ...textStyle,
  fontWeight: 600,
}

const heroHeadingStyle: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Arial, sans-serif',
  fontWeight: 700,
  fontSize: "26px",
  margin: "0 0 12px",
  color: TEXT_LIGHT,
}

const brandMarkStyle: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Arial, sans-serif',
  fontWeight: 700,
  letterSpacing: "0.28em",
  fontSize: "11px",
  color: "rgba(245,245,247,0.8)",
  textTransform: "uppercase",
  margin: 0,
}

const metaGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "14px",
  marginTop: "18px",
}

const metaCardStyle: React.CSSProperties = {
  borderRadius: "16px",
  padding: "16px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
}

const metaLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.24em",
  color: "rgba(245,245,247,0.6)",
  margin: "0 0 6px",
}

const metaValueStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 600,
  color: TEXT_LIGHT,
  margin: 0,
}

const itemRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  padding: "12px 16px",
  borderRadius: "14px",
}

const summaryRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  padding: "4px 0",
}

const ctaButtonBase: React.CSSProperties = {
  display: "inline-block",
  padding: "14px 28px",
  borderRadius: "999px",
  color: "#fff",
  fontFamily: '"Helvetica Neue", Arial, sans-serif',
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  letterSpacing: "0.02em",
  margin: "22px 0 24px",
}

type LanguageBlock = {
  code: LanguageCode
  locale: string
  languageLabel: string
  preview: (orderId: string) => string
  heading: string
  intro: React.ReactNode
  summaryTitle: string
  noItemsCopy: string
  itemFallbackLabel: string
  metaLabels: {
    order: string
    email: string
    total: string
  }
  summaryLabels: {
    subtotal: string
    shipping: string
    total: string
  }
  ctaLabel: string
  contactCopy: React.ReactNode
  closingLines: string[]
  theme: LanguageTheme
}

export const OrderThanksEmailComponent = ({
  order,
}: OrderThanksEmailProps) => {
  const currency = order.currency_code?.toUpperCase?.() || "EUR"
  const orderId = resolveOrderId(order)
  const customerName = resolveCustomerName(order)
  const emailDisplay = order.email?.trim() || "—"
  const totals = {
    subtotal:
      typeof order.subtotal === "number"
        ? order.subtotal
        : typeof order.item_total === "number"
        ? order.item_total
        : null,
    shipping: typeof order.shipping_total === "number" ? order.shipping_total : null,
    total: typeof order.total === "number" ? order.total : null,
  }

  const languageBlocks: Record<LanguageCode, LanguageBlock> = {
    hu: {
      code: "hu",
      locale: "hu-HU",
      languageLabel: "Magyar",
      preview: (id) => `Rendelési összefoglaló: ${id}`,
      heading: `Köszönjük, ${customerName}!`,
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
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            style={{ color: F1_RED, fontWeight: 600, textDecoration: "none" }}
          >
            {CONTACT_EMAIL}
          </a>{" "}
          címen vagy a {CONTACT_PHONE} telefonszámon.
        </>
      ),
      closingLines: ["Üdvözlettel,", "A Tehergumi.net csapata"],
      theme: LANGUAGE_THEMES.hu,
    },
    sk: {
      code: "sk",
      locale: "sk-SK",
      languageLabel: "Slovenčina",
      preview: (id) => `Zhrnutie objednávky: ${id}`,
      heading: `Ďakujeme, ${customerName}!`,
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
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            style={{ color: F1_RED, fontWeight: 600, textDecoration: "none" }}
          >
            {CONTACT_EMAIL}
          </a>{" "}
          alebo na čísle {CONTACT_PHONE}.
        </>
      ),
      closingLines: ["S pozdravom,", "Tím Tehergumi.net"],
      theme: LANGUAGE_THEMES.sk,
    },
  }

  const languageCode = resolveLanguageFromOrder(order)
  const lang = languageBlocks[languageCode] ?? languageBlocks.hu
  const items = prepareOrderItems(order, lang.itemFallbackLabel)
  const orderUrl = buildOrderUrl(orderId, languageCode)
  const orderTotalDisplay = formatAmount(totals.total, currency, lang.locale)
  const accentColor = lang.code === "hu" ? F1_RED : "#4DA3FF"

  return (
    <Html>
      <Head />
      <Preview>{lang.preview(orderId)}</Preview>
      <Body
        style={{
          background: "#08080B",
          margin: 0,
          padding: "32px 0",
        }}
      >
        <Container style={containerStyle}>
          <Section
            style={{
              ...sectionStyle,
              background: lang.theme.cardBackground,
            }}
          >
            <Text style={brandMarkStyle}>TEHERGUMI.NET</Text>
            <Text style={{ ...languageTagStyle, color: lang.theme.tagColor }}>
              {lang.languageLabel}
            </Text>
            <Heading style={heroHeadingStyle}>{lang.heading}</Heading>
            <Text style={textStyle}>{lang.intro}</Text>

            <Section style={metaGridStyle}>
              <Section style={metaCardStyle}>
                <Text style={metaLabelStyle}>{lang.metaLabels.order}</Text>
                <Text style={metaValueStyle}>{orderId}</Text>
              </Section>
              <Section style={metaCardStyle}>
                <Text style={metaLabelStyle}>{lang.metaLabels.email}</Text>
                <Text style={metaValueStyle}>{emailDisplay}</Text>
              </Section>
              <Section style={metaCardStyle}>
                <Text style={metaLabelStyle}>{lang.metaLabels.total}</Text>
                <Text style={metaValueStyle}>{orderTotalDisplay}</Text>
              </Section>
            </Section>

            <Section
              style={{
                margin: "24px 0",
                padding: "22px",
                borderRadius: "16px",
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(0,0,0,0.35))",
              }}
            >
              <Heading
                as="h3"
                style={{
                  fontFamily: '"Helvetica Neue", Arial, sans-serif',
                  fontWeight: 600,
                  fontSize: "16px",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: accentColor,
                  margin: "0 0 14px",
                }}
              >
                {lang.summaryTitle}
              </Heading>
              {items.length ? (
                items.map((item) => (
                  <Section
                    key={`${lang.code}-${item.key}`}
                    style={{
                      ...itemRowStyle,
                      background: lang.theme.itemBackground,
                    }}
                  >
                    <Text style={{ ...textStyle, margin: 0 }}>
                      {item.quantity}× {item.name}
                    </Text>
                    <Text style={{ ...strongText, margin: 0 }}>
                      {formatAmount(item.price, currency, lang.locale)}
                    </Text>
                  </Section>
                ))
              ) : (
                <Text style={{ ...textStyle, margin: 0 }}>{lang.noItemsCopy}</Text>
              )}
              <Hr style={{ borderColor: "rgba(255,255,255,0.08)" }} />
              <SummaryRow
                label={lang.summaryLabels.subtotal}
                value={formatAmount(totals.subtotal, currency, lang.locale)}
              />
              <SummaryRow
                label={lang.summaryLabels.shipping}
                value={formatAmount(totals.shipping, currency, lang.locale)}
              />
              <SummaryRow
                label={lang.summaryLabels.total}
                value={formatAmount(totals.total, currency, lang.locale)}
                accent
                accentColor={accentColor}
              />
            </Section>

            <a
              href={orderUrl}
              style={{
                ...ctaButtonBase,
                background: lang.theme.ctaBackground,
                boxShadow: lang.theme.ctaShadow,
              }}
            >
              {lang.ctaLabel}
            </a>

            <Text style={textStyle}>{lang.contactCopy}</Text>

            <Text style={{ ...textStyle, color: "rgba(255,255,255,0.7)" }}>
              {lang.closingLines.map((line, index) => (
                <React.Fragment key={`${lang.code}-closing-${index}`}>
                  {line}
                  {index < lang.closingLines.length - 1 && <br />}
                </React.Fragment>
              ))}
            </Text>
          </Section>

          <Text
            style={{
              ...textStyle,
              color: "rgba(255,255,255,0.45)",
              textAlign: "center",
              fontSize: "12px",
            }}
          >
            {lang.code === "hu"
              ? "Ez egy automatikusan generált üzenet, kérjük ne válaszolj rá közvetlenül."
              : "Toto je automaticky generovaná správa, prosím, neodpovedajte na ňu."}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const SummaryRow = ({
  label,
  value,
  accent = false,
  accentColor = F1_RED,
}: {
  label: string
  value: string
  accent?: boolean
  accentColor?: string
}) => (
  <Section style={summaryRowStyle}>
    <Text
      style={{
        ...textStyle,
        margin: 0,
        color: accent ? TEXT_LIGHT : "rgba(245,245,247,0.88)",
        fontWeight: accent ? 700 : 500,
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        ...strongText,
        margin: 0,
        fontSize: accent ? "18px" : strongText.fontSize,
        color: accent ? accentColor : strongText.color,
      }}
    >
      {value}
    </Text>
  </Section>
)

export const mockOrderThanks: OrderThanksEmailProps = {
  order: {
    id: "order_01JSNXDH9BPJWWKVW03B9E9KW8",
    display_id: 1,
    email: "partner@tehergumi.net",
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
}
