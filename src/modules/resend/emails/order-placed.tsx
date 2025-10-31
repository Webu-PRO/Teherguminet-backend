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

const sectionStyle: React.CSSProperties = {
  borderRadius: "18px",
  padding: "32px",
  background: PANEL_BG,
  color: TEXT_LIGHT,
  border: "1px solid rgba(225,6,0,0.22)",
  boxShadow: "0 14px 32px rgba(0,0,0,0.45)",
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

const normalizeBaseUrl = (raw?: string | null) => {
  if (!raw) {
    return DEFAULT_STOREFRONT_URL
  }

  const trimmed = raw.trim()

  if (!trimmed) {
    return DEFAULT_STOREFRONT_URL
  }

  const hasProtocol = /^https?:\/\//i.test(trimmed)
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
  currencyCode: string
) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—"
  }

  const currency = currencyCode?.toUpperCase?.() || "EUR"

  try {
    return new Intl.NumberFormat("hu-HU", {
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

  return order.id || "Rendelésed"
}

const resolveCustomerName = (order: OrderPlacedEmailProps["order"]) =>
  order.customer?.first_name?.trim() ||
  order.shipping_address?.first_name?.trim() ||
  "Partnerünk"

type PreparedOrderItem = {
  key: string
  name: string
  quantity: number
  price: string
}

const prepareOrderItems = (
  order: OrderPlacedEmailProps["order"],
  currencyCode: string
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
      typeof item.total === "number" ? item.total : item.unit_price
    const price = formatAmount(priceSource ?? null, currencyCode)

    return {
      key: item.id?.toString() ?? `${name}-${index}`,
      name,
      quantity,
      price,
    }
  })
}

export const OrderPlacedEmailComponent = ({
  order,
}: OrderPlacedEmailProps) => {
  const currency = order.currency_code?.toUpperCase?.() || "EUR"
  const orderId = resolveOrderId(order)
  const customerName = resolveCustomerName(order)
  const orderUrl = buildOrderUrl(orderId)
  const items = prepareOrderItems(order, currency)
  const subtotal = formatAmount(
    order.subtotal ?? order.item_total ?? null,
    currency
  )
  const shipping = formatAmount(order.shipping_total ?? null, currency)
  const total = formatAmount(order.total ?? null, currency)

  return (
    <Html>
      <Head />
      <Preview>Rendelés visszaigazolása: {orderId}</Preview>
      <Body
        style={{
          background: "#0C0C0F",
          margin: 0,
          padding: "32px 0",
        }}
      >
        <Container
          style={{
            width: "100%",
            maxWidth: "560px",
            margin: "0 auto",
            padding: "0 24px",
          }}
        >
          <Section style={sectionStyle}>
            <Heading
              as="h2"
              style={{
                fontFamily: '"Helvetica Neue", Arial, sans-serif',
                fontWeight: 700,
                fontSize: "24px",
                margin: "0 0 16px",
                color: TEXT_LIGHT,
              }}
            >
              Köszönjük, {customerName}!
            </Heading>
            <Text style={textStyle}>
              Megerősítjük, hogy a{" "}
              <strong style={{ color: TEXT_LIGHT }}>{orderId}</strong> számú
              rendelésedet rögzítettük. Amint összekészítettük az abroncsokat a
              raktárunkban, külön e-mailben értesítünk a kiszállítás
              részleteiről.
            </Text>

            <Section
              style={{
                margin: "24px 0",
                padding: "20px",
                borderRadius: "14px",
                background:
                  "linear-gradient(135deg, rgba(225,6,0,0.18) 0%, rgba(225,6,0,0.04) 100%)",
              }}
            >
              <Heading
                as="h3"
                style={{
                  fontFamily: '"Helvetica Neue", Arial, sans-serif',
                  fontWeight: 600,
                  fontSize: "16px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: F1_RED,
                  margin: "0 0 12px",
                }}
              >
                Rendelési összefoglaló
              </Heading>
              {items.length ? (
                items.map((item) => (
                  <Section
                    key={item.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "16px",
                      padding: "10px 0",
                    }}
                  >
                    <Text style={{ ...textStyle, margin: 0 }}>
                      {item.quantity}× {item.name}
                    </Text>
                    <Text style={{ ...strongText, margin: 0 }}>{item.price}</Text>
                  </Section>
                ))
              ) : (
                <Text style={{ ...textStyle, margin: 0 }}>
                  A rendeléshez nem tartoznak tételadatok.
                </Text>
              )}
              <Hr style={{ borderColor: "rgba(255,255,255,0.08)" }} />
              <SummaryRow label="Részösszeg" value={subtotal} />
              <SummaryRow label="Szállítás" value={shipping} />
              <SummaryRow label="Fizetendő végösszeg" value={total} accent />
            </Section>

            <Text style={textStyle}>
              A rendelés aktuális állapotát bármikor ellenőrizheted az alábbi
              gombra kattintva:
            </Text>

            <a
              href={orderUrl}
              style={{
                display: "inline-block",
                padding: "14px 28px",
                borderRadius: "999px",
                background: F1_RED,
                color: "#fff",
                fontFamily: '"Helvetica Neue", Arial, sans-serif',
                fontSize: "15px",
                fontWeight: 600,
                textDecoration: "none",
                letterSpacing: "0.02em",
                boxShadow: "0 10px 24px rgba(225,6,0,0.35)",
                marginBottom: "24px",
              }}
            >
              Rendelés megtekintése
            </a>

            <Text style={textStyle}>
              Kérdésed van? Vedd fel velünk a kapcsolatot a{" "}
              <a
                href="mailto:hello@tehergumi.net"
                style={{ color: F1_RED, fontWeight: 600, textDecoration: "none" }}
              >
                hello@tehergumi.net
              </a>{" "}
              címen vagy a +36 1 234 5678 telefonszámon.
            </Text>

            <Text style={{ ...textStyle, color: "rgba(255,255,255,0.7)" }}>
              Üdvözlettel,
              <br />
              A Tehergumi.net csapata
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
            Ez egy automatikusan generált üzenet, kérjük ne válaszolj rá
            közvetlenül.
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
  <Section
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "16px",
      padding: "4px 0",
    }}
  >
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
