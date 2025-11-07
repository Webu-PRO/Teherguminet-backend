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

type OrderAddress = {
  first_name?: string | null
  last_name?: string | null
  [key: string]: unknown
} | null

type OrderItem = {
  id?: string | null
  title?: string | null
  product_title?: string | null
  quantity?: number | null
  total?: number | null
  unit_price?: number | null
  [key: string]: unknown
}

type OrderShippingMethod = {
  id: string
  name?: string | null
  amount?: number | null
  [key: string]: unknown
}

type OrderCustomer = {
  first_name?: string | null
  [key: string]: unknown
} | null

export type OrderPlacedEmailProps = {
  order: {
    id: string
    display_id?: number | string | null
    email?: string | null
    currency_code?: string | null
    total?: number | null
    subtotal?: number | null
    shipping_total?: number | null
    item_total?: number | null
    shipping_address?: OrderAddress
    billing_address?: OrderAddress
    items?: OrderItem[]
    shipping_methods?: OrderShippingMethod[]
    customer?: OrderCustomer
    [key: string]: unknown
  }
}

const DEFAULT_STOREFRONT_URL = "https://therguminet.hu"
const F1_RED = "#E10600"
const PANEL_BG = "rgba(20,20,22,0.92)"
const TEXT_LIGHT = "#F5F5F7"
const CONTACT_EMAIL = "hello@tehergumi.net"
const CONTACT_PHONE = "+36 1 234 5678"

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
  maxWidth: "600px",
  margin: "0 auto",
  padding: "0 24px",
}

const languageTagStyle: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Arial, sans-serif',
  fontSize: "12px",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "rgba(245,245,247,0.66)",
  margin: 0,
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
  fontSize: "28px",
  margin: "8px 0 12px",
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
  marginTop: "16px",
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
  marginBottom: "24px",
}

const LANGUAGE_THEMES = {
  hu: {
    cardBackground:
      "linear-gradient(135deg, rgba(225,6,0,0.32) 0%, rgba(12,12,15,0.92) 70%)",
    itemBackground: "rgba(225,6,0,0.12)",
    ctaBackground: "#F75757",
    ctaShadow: "0 10px 24px rgba(225,6,0,0.45)",
    tagColor: "rgba(246,214,214,0.9)",
  },
  sk: {
    cardBackground:
      "linear-gradient(135deg, rgba(20,120,255,0.32) 0%, rgba(12,12,15,0.92) 70%)",
    itemBackground: "rgba(32,140,255,0.12)",
    ctaBackground: "#1C7ED6",
    ctaShadow: "0 10px 24px rgba(28,126,214,0.45)",
    tagColor: "rgba(210,232,255,0.92)",
  },
} as const

type LanguageCode = keyof typeof LANGUAGE_THEMES

type LanguageTheme = (typeof LANGUAGE_THEMES)[LanguageCode]

const normalizeBaseUrl = (raw?: string | null) => {
  if (!raw) {
    return DEFAULT_STOREFRONT_URL
  }

  const trimmed = raw.trim()

  if (!trimmed) {
    return DEFAULT_STOREFRONT_URL
  }

  const hasProtocol = /^https?:\/{2}/i.test(trimmed)
  const candidate = hasProtocol ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(candidate)
    url.hash = ""
    url.search = ""
    return url.toString().replace(/\/+$/, "")
  } catch {
    return DEFAULT_STOREFRONT_URL
  }
}

const buildOrderUrl = (orderId: string | null | undefined) => {
  const base =
    process.env.ORDER_CONFIRMATION_URL_BASE ??
    process.env.STOREFRONT_URL ??
    DEFAULT_STOREFRONT_URL
  const normalizedBase = normalizeBaseUrl(base)

  if (!orderId) {
    return normalizedBase
  }

  const sanitizedId = encodeURIComponent(orderId.trim())
  const pathname = `/hu/store/orders/${sanitizedId}`

  try {
    return new URL(pathname, normalizedBase).toString()
  } catch {
    return `${normalizedBase}${pathname}`
  }
}

const formatAmount = (
  value: number | null | undefined,
  currencyCode: string,
  locale: string = "hu-HU"
) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—"
  }

  const currency = currencyCode?.toUpperCase?.() || "EUR"

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

const resolveOrderId = (order: OrderPlacedEmailProps["order"]) => {
  const displayId = order.display_id

  if (typeof displayId === "number" && Number.isFinite(displayId)) {
    return `TG-${displayId.toString().padStart(6, "0")}`
  }

  if (typeof displayId === "string" && displayId.trim().length > 0) {
    return displayId.trim()
  }

  return order.id || "Order"
}

const resolveCustomerName = (order: OrderPlacedEmailProps["order"]) =>
  order.customer?.first_name?.trim() ||
  order.shipping_address?.first_name?.trim() ||
  "Partner"

type PreparedOrderItem = {
  key: string
  name: string
  quantity: number
  price: number | null
}

const prepareOrderItems = (
  order: OrderPlacedEmailProps["order"]
): PreparedOrderItem[] => {
  const items = Array.isArray(order.items) ? order.items : []

  return items.map((item, index) => {
    const name =
      item.product_title?.trim() ||
      item.title?.trim() ||
      `Termék ${index + 1}`
    const quantity =
      typeof item.quantity === "number" && !Number.isNaN(item.quantity)
        ? item.quantity
        : 1
    const priceSource =
      typeof item.total === "number"
        ? item.total
        : typeof item.unit_price === "number"
        ? item.unit_price
        : null

    return {
      key: item.id?.toString() ?? `${name}-${index}`,
      name,
      quantity,
      price: priceSource,
    }
  })
}

type LanguageBlock = {
  code: LanguageCode
  locale: string
  languageLabel: string
  heading: string
  intro: React.ReactNode
  summaryTitle: string
  noItemsCopy: string
  summaryLabels: {
    subtotal: string
    shipping: string
    total: string
  }
  statusCopy: React.ReactNode
  ctaLabel: string
  contactCopy: React.ReactNode
  closingLines: string[]
  theme: LanguageTheme
}

export const OrderPlacedEmailComponent = ({
  order,
}: OrderPlacedEmailProps) => {
  const currency = order.currency_code?.toUpperCase?.() || "EUR"
  const orderId = resolveOrderId(order)
  const customerName = resolveCustomerName(order)
  const orderUrl = buildOrderUrl(orderId)
  const items = prepareOrderItems(order)
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
  const emailDisplay = order.email?.trim() || "—"
  const orderTotalCombined = `${formatAmount(totals.total, currency, "hu-HU")} · ${formatAmount(
    totals.total,
    currency,
    "sk-SK"
  )}`

  const languageBlocks: LanguageBlock[] = [
    {
      code: "hu",
      locale: "hu-HU",
      languageLabel: "Magyar / Hungarian",
      heading: `Köszönjük, ${customerName}!`,
      intro: (
        <>
          Megerősítjük, hogy a{" "}
          <strong style={{ color: TEXT_LIGHT }}>{orderId}</strong> számú rendelésedet
          rögzítettük. Amint összekészítettük az abroncsokat a raktárunkban, külön
          e-mailben értesítünk a kiszállítás részleteiről.
        </>
      ),
      summaryTitle: "Rendelési összefoglaló",
      noItemsCopy: "A rendeléshez nem tartoznak tételadatok.",
      summaryLabels: {
        subtotal: "Részösszeg",
        shipping: "Szállítás",
        total: "Fizetendő végösszeg",
      },
      statusCopy:
        "A rendelés aktuális állapotát bármikor ellenőrizheted az alábbi gombra kattintva:",
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
    {
      code: "sk",
      locale: "sk-SK",
      languageLabel: "Slovenčina / Slovak",
      heading: `Ďakujeme, ${customerName}!`,
      intro: (
        <>
          Potvrdzujeme prijatie objednávky{" "}
          <strong style={{ color: TEXT_LIGHT }}>{orderId}</strong>. Hneď ako v sklade
          pripravíme pneumatiky, pošleme vám ďalší e-mail s detailmi doručenia.
        </>
      ),
      summaryTitle: "Zhrnutie objednávky",
      noItemsCopy: "K objednávke momentálne nemáme položky.",
      summaryLabels: {
        subtotal: "Medzisúčet",
        shipping: "Doprava",
        total: "Celková suma na úhradu",
      },
      statusCopy:
        "Aktuálny stav objednávky si môžete kedykoľvek pozrieť kliknutím na tlačidlo nižšie:",
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
  ]

  return (
    <Html>
      <Head />
      <Preview>
        Rendelés visszaigazolása / Potvrdenie objednávky: {orderId}
      </Preview>
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
              padding: "40px 32px",
              marginBottom: "28px",
              background:
                "linear-gradient(135deg, rgba(225,6,0,0.14) 0%, rgba(8,8,11,0.95) 65%)",
            }}
          >
            <Text style={brandMarkStyle}>TEHERGUMI.NET</Text>
            <Heading style={heroHeadingStyle}>
              Rendelés visszaigazolva / Objednávka potvrdená
            </Heading>
            <Text style={{ ...textStyle, marginBottom: "18px" }}>
              Ezt az értesítést magyarul és szlovákul is elküldjük, hogy minden fontos
              részlet kéznél legyen bármelyik partnerünknek.
              <br />
              Toto potvrdenie nájdete v oboch jazykoch, aby ste mali všetky informácie po
              ruke.
            </Text>

            <Section style={metaGridStyle}>
              <Section style={metaCardStyle}>
                <Text style={metaLabelStyle}>Azonosító / ID</Text>
                <Text style={metaValueStyle}>{orderId}</Text>
              </Section>
              <Section style={metaCardStyle}>
                <Text style={metaLabelStyle}>Email</Text>
                <Text style={metaValueStyle}>{emailDisplay}</Text>
              </Section>
              <Section style={metaCardStyle}>
                <Text style={metaLabelStyle}>Végösszeg / Celková suma</Text>
                <Text style={metaValueStyle}>{orderTotalCombined}</Text>
              </Section>
            </Section>
          </Section>

          {languageBlocks.map((lang) => {
            const subtotalDisplay = formatAmount(totals.subtotal, currency, lang.locale)
            const shippingDisplay = formatAmount(totals.shipping, currency, lang.locale)
            const totalDisplay = formatAmount(totals.total, currency, lang.locale)

            return (
              <Section
                key={lang.code}
                style={{
                  ...sectionStyle,
                  marginBottom: "24px",
                  background: lang.theme.cardBackground,
                }}
              >
                <Text style={{ ...languageTagStyle, color: lang.theme.tagColor }}>
                  {lang.languageLabel}
                </Text>
                <Heading
                  as="h2"
                  style={{
                    fontFamily: '"Helvetica Neue", Arial, sans-serif',
                    fontWeight: 700,
                    fontSize: "24px",
                    margin: "10px 0 16px",
                    color: TEXT_LIGHT,
                  }}
                >
                  {lang.heading}
                </Heading>
                <Text style={textStyle}>{lang.intro}</Text>

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
                      color: lang.code === "hu" ? F1_RED : "#4DA3FF",
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
                  <SummaryRow label={lang.summaryLabels.subtotal} value={subtotalDisplay} />
                  <SummaryRow label={lang.summaryLabels.shipping} value={shippingDisplay} />
                  <SummaryRow label={lang.summaryLabels.total} value={totalDisplay} accent />
                </Section>

                <Text style={textStyle}>{lang.statusCopy}</Text>

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
            )
          })}

          <Text
            style={{
              ...textStyle,
              color: "rgba(255,255,255,0.45)",
              textAlign: "center",
              fontSize: "12px",
            }}
          >
            Ez egy automatikusan generált üzenet, kérjük ne válaszolj rá közvetlenül.
            <br />
            Toto je automaticky generovaná správa, prosím, neodpovedajte na ňu.
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
}: {
  label: string
  value: string
  accent?: boolean
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
        color: accent ? F1_RED : strongText.color,
      }}
    >
      {value}
    </Text>
  </Section>
)

export const mockOrder: OrderPlacedEmailProps = {
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
