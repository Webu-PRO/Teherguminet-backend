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

type PaymentSummary = {
  id?: string | null
  amount?: number | string | null
  currency_code?: string | null
  provider_id?: string | null
  captured_at?: Date | string | null
}

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

type OrderCustomer = {
  first_name?: string | null
  [key: string]: unknown
} | null

export type PaymentReceiptEmailProps = {
  payment?: PaymentSummary | null
  order?: {
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
    customer?: OrderCustomer
    [key: string]: unknown
  } | null
}

const BRAND = "Tehergumi.net"
const CARD_BG = "#0B0B10"
const PANEL_BG = "linear-gradient(135deg, rgba(225,6,0,0.14), rgba(12,12,15,0.9))"
const TEXT_LIGHT = "#F5F5F7"
const ACCENT = "#E10600"

const containerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "640px",
  margin: "0 auto",
  padding: "0 24px",
}

const sectionStyle: React.CSSProperties = {
  borderRadius: "18px",
  padding: "28px",
  background: PANEL_BG,
  color: TEXT_LIGHT,
  border: "1px solid rgba(225,6,0,0.22)",
  boxShadow: "0 18px 36px rgba(0,0,0,0.5)",
}

const textStyle: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Arial, sans-serif',
  fontSize: "15px",
  lineHeight: "22px",
  margin: "0 0 12px",
  color: TEXT_LIGHT,
}

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "rgba(245,245,247,0.7)",
  margin: 0,
}

const valueStyle: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Arial, sans-serif',
  fontSize: "18px",
  fontWeight: 700,
  color: TEXT_LIGHT,
  margin: "4px 0 0",
}

const metaviewStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
  marginTop: "14px",
}

const metaCardStyle: React.CSSProperties = {
  borderRadius: "14px",
  padding: "14px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
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
      padding: "6px 0",
    }}
  >
    <Text
      style={{
        ...textStyle,
        margin: 0,
        color: accent ? TEXT_LIGHT : "rgba(245,245,247,0.78)",
        fontWeight: accent ? 700 : 500,
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        ...textStyle,
        margin: 0,
        fontWeight: accent ? 700 : 600,
        color: accent ? ACCENT : TEXT_LIGHT,
      }}
    >
      {value}
    </Text>
  </Section>
)

const formatAmount = (
  value: number | string | null | undefined,
  currencyCode: string | null | undefined,
  locale: string = "hu-HU"
) => {
  if (value === null || value === undefined) {
    return "—"
  }

  const numericValue =
    typeof value === "string" ? Number.parseFloat(value) : Number(value)

  if (!Number.isFinite(numericValue)) {
    return "—"
  }

  const currency = currencyCode?.toUpperCase?.() || "EUR"

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numericValue)
  } catch {
    return `${numericValue.toFixed(2)} ${currency}`
  }
}

const resolveOrderId = (order?: PaymentReceiptEmailProps["order"]) => {
  if (!order) {
    return "Rendelés"
  }

  const displayId = order.display_id

  if (typeof displayId === "number" && Number.isFinite(displayId)) {
    return `TG-${displayId.toString().padStart(6, "0")}`
  }

  if (typeof displayId === "string" && displayId.trim().length) {
    return displayId.trim()
  }

  return order.id || "Rendelés"
}

const resolveName = (order?: PaymentReceiptEmailProps["order"]) =>
  order?.customer?.first_name?.trim() ||
  order?.shipping_address?.first_name?.trim() ||
  "Partner"

const prepareItems = (order?: PaymentReceiptEmailProps["order"]) => {
  const items = Array.isArray(order?.items) ? order?.items : []

  return items.map((item, index) => {
    const name =
      item.product_title?.trim() || item.title?.trim() || `Tétel ${index + 1}`
    const qty =
      typeof item.quantity === "number" && !Number.isNaN(item.quantity)
        ? item.quantity
        : 1
    const price =
      typeof item.total === "number"
        ? item.total
        : typeof item.unit_price === "number"
        ? item.unit_price
        : null

    return {
      key: item.id ?? `${name}-${index}`,
      name,
      quantity: qty,
      price,
    }
  })
}

export const PaymentReceiptEmail = ({
  payment,
  order,
}: PaymentReceiptEmailProps) => {
  const orderId = resolveOrderId(order)
  const customerName = resolveName(order)
  const currency = order?.currency_code || payment?.currency_code || "EUR"
  const items = prepareItems(order)
  const paymentAmount =
    payment?.amount !== undefined && payment?.amount !== null
      ? payment.amount
      : order?.total
  const captured = payment?.captured_at
    ? new Date(payment.captured_at)
    : null
  const paymentDate = captured
    ? captured.toLocaleString("hu-HU")
    : "Frissen feldolgozva"

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
  }

  return (
    <Html>
      <Head />
      <Preview>
        Fizetési bizonylat / Payment receipt · {orderId}
      </Preview>
      <Body
        style={{
          background: CARD_BG,
          margin: 0,
          padding: "32px 0",
        }}
      >
        <Container style={containerStyle}>
          <Section style={sectionStyle}>
            <Text
              style={{
                fontFamily: '"Helvetica Neue", Arial, sans-serif',
                fontSize: "11px",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "rgba(245,245,247,0.76)",
                margin: 0,
              }}
            >
              {BRAND}
            </Text>
            <Heading
              style={{
                fontFamily: '"Helvetica Neue", Arial, sans-serif',
                fontSize: "26px",
                margin: "6px 0 10px",
                color: TEXT_LIGHT,
              }}
            >
              Fizetési visszaigazolás / Payment receipt
            </Heading>
            <Text style={textStyle}>
              Köszönjük a vásárlást, {customerName}! Az alábbiakban megtalálod a
              sikeres fizetés részleteit. <br />
              Thank you for your purchase! Here are the details of your payment.
            </Text>

            <Section style={metaviewStyle}>
              <Section style={metaCardStyle}>
                <Text style={labelStyle}>Rendelés / Order</Text>
                <Text style={valueStyle}>{orderId}</Text>
              </Section>
              <Section style={metaCardStyle}>
                <Text style={labelStyle}>Fizetett összeg / Amount</Text>
                <Text style={valueStyle}>
                  {formatAmount(paymentAmount, currency, "hu-HU")}
                </Text>
              </Section>
              <Section style={metaCardStyle}>
                <Text style={labelStyle}>Dátum / Date</Text>
                <Text style={valueStyle}>{paymentDate}</Text>
              </Section>
              <Section style={metaCardStyle}>
                <Text style={labelStyle}>Módszer / Method</Text>
                <Text style={valueStyle}>
                  {payment?.provider_id?.toUpperCase?.() || "Stripe"}
                </Text>
              </Section>
            </Section>

            <Section
              style={{
                marginTop: "20px",
                padding: "18px",
                borderRadius: "14px",
                background: "rgba(255,255,255,0.05)",
              }}
            >
              <Heading
                as="h3"
                style={{
                  fontFamily: '"Helvetica Neue", Arial, sans-serif',
                  fontSize: "16px",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: ACCENT,
                  margin: "0 0 10px",
                }}
              >
                Tételrészletek / Line items
              </Heading>

              {items.length ? (
                items.map((item) => (
                  <Section
                    key={item.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0",
                    }}
                  >
                    <Text style={{ ...textStyle, margin: 0 }}>
                      {item.quantity}× {item.name}
                    </Text>
                    <Text style={{ ...textStyle, margin: 0, fontWeight: 700 }}>
                      {formatAmount(item.price, currency, "hu-HU")}
                    </Text>
                  </Section>
                ))
              ) : (
                <Text style={{ ...textStyle, margin: 0 }}>
                  A rendeléshez nem tartoznak tételadatok. / No line items were
                  found.
                </Text>
              )}

              <Hr style={{ borderColor: "rgba(255,255,255,0.12)" }} />
              <SummaryRow
                label="Részösszeg / Subtotal"
                value={formatAmount(totals.subtotal, currency, "hu-HU")}
              />
              <SummaryRow
                label="Szállítás / Shipping"
                value={formatAmount(totals.shipping, currency, "hu-HU")}
              />
              <SummaryRow
                accent
                label="Fizetendő / Charged"
                value={formatAmount(totals.total, currency, "hu-HU")}
              />
            </Section>

            <Section style={{ marginTop: "16px" }}>
              <Text style={textStyle}>
                A bizonylatot e-mailben őrizd meg. Ha ÁFA-s számlára van
                szükség, jelezd nekünk a válasz e-mailben, és elkészítjük.
                <br />
                Please keep this receipt for your records. Need an invoice?
                Reply to this email and we’ll issue it.
              </Text>
              <Text
                style={{
                  ...textStyle,
                  color: "rgba(255,255,255,0.7)",
                  marginBottom: 0,
                }}
              >
                Üdvözlettel,
                <br />
                A {BRAND} csapata
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

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
    email: "partner@tehergumi.net",
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
}
