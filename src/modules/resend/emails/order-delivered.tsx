import * as React from "react"
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
} from "@react-email/components"
import {
  LanguageCode,
  resolveLanguageFromOrder,
} from "../email-language"
import {
  CONTACT_EMAIL,
  CONTACT_PHONE,
  F1_RED,
  buildOrderUrl,
  resolveCustomerName,
  resolveOrderId,
  type OrderEmailOrder,
} from "./order-email-shared"

export type OrderDeliveredEmailProps = {
  order: OrderEmailOrder
  fulfillment?: {
    delivered_at?: string | Date | null
    shipping_option_name?: string | null
    tracking_numbers?: Array<string | null | undefined> | null
  } | null
}

const FONT_STACK =
  '"SF Pro Text","SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif'

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
    maxWidth: "640px",
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
    fontSize: "15px",
    lineHeight: "22px",
    color: "#111111",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  divider: {
    borderTop: "1px solid #E5E7EB",
    margin: 0,
  } as React.CSSProperties,
  content: {
    padding: "18px 28px 28px",
  } as React.CSSProperties,
  detailCard: {
    marginTop: "16px",
    borderRadius: "16px",
    border: "1px solid #E5E7EB",
    backgroundColor: "#F9FAFB",
    padding: "16px",
  } as React.CSSProperties,
  label: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    color: "#6B7280",
    margin: "0 0 6px",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  value: {
    fontSize: "15px",
    fontWeight: 700,
    color: "#111111",
    margin: 0,
    fontFamily: FONT_STACK,
    wordBreak: "break-word",
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
  muted: {
    margin: "10px 0 0",
    fontSize: "12px",
    lineHeight: "18px",
    color: "#6B7280",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  link: {
    color: "#111111",
    textDecoration: "underline",
    fontFamily: FONT_STACK,
    wordBreak: "break-word",
  } as React.CSSProperties,
  footer: {
    textAlign: "center",
    fontSize: "12px",
    lineHeight: "18px",
    color: "#6B7280",
    margin: "16px 0 0",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
}

type LanguageBlock = {
  code: LanguageCode
  locale: string
  preview: (orderId: string) => string
  heading: string
  intro: (name: string, orderId: string) => React.ReactNode
  labels: {
    order: string
    deliveredAt: string
    shippingMethod: string
    tracking: string
  }
  deliveredFallback: string
  ctaLabel: string
  contactCopy: React.ReactNode
  closingLines: string[]
  footer: string
}

export const OrderDeliveredEmail = ({
  order,
  fulfillment,
}: OrderDeliveredEmailProps) => {
  const languageCode = resolveLanguageFromOrder(order)
  const orderId = resolveOrderId(order)
  const customerName = resolveCustomerName(order)

  const languageBlocks: Record<LanguageCode, LanguageBlock> = {
    hu: {
      code: "hu",
      locale: "hu-HU",
      preview: (id) => `Rendelés kiszállítva: ${id}`,
      heading: "Kiszállítva",
      intro: (name, id) => (
        <>
          Jó hír, {name}! A <strong style={{ color: "#111111" }}>{id}</strong>{" "}
          rendelésedet kiszállítottuk.
        </>
      ),
      labels: {
        order: "Rendelés azonosító",
        deliveredAt: "Kiszállítás dátuma",
        shippingMethod: "Szállítási mód",
        tracking: "Nyomkövetés",
      },
      deliveredFallback: "Frissen kiszállítva",
      ctaLabel: "Rendelés megtekintése",
      contactCopy: (
        <>
          Kérdésed van? Írj nekünk a{" "}
          <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
            {CONTACT_EMAIL}
          </Link>{" "}
          címre, vagy hívj minket a{" "}
          <Link href={`tel:${CONTACT_PHONE}`} style={styles.link}>
            {CONTACT_PHONE}
          </Link>{" "}
          telefonszámon.
        </>
      ),
      closingLines: ["Üdvözlettel,", "A Teherguminet.hu csapata"],
      footer:
        "Ez egy automatikusan generált üzenet, kérjük ne válaszolj rá közvetlenül.",
    },
    sk: {
      code: "sk",
      locale: "sk-SK",
      preview: (id) => `Objednávka doručená: ${id}`,
      heading: "Objednávka doručená",
      intro: (name, id) => (
        <>
          Skvelá správa, {name}! Vašu objednávku{" "}
          <strong style={{ color: "#111111" }}>{id}</strong> sme doručili.
        </>
      ),
      labels: {
        order: "ID objednávky",
        deliveredAt: "Dátum doručenia",
        shippingMethod: "Spôsob doručenia",
        tracking: "Sledovanie",
      },
      deliveredFallback: "Práve doručené",
      ctaLabel: "Zobraziť objednávku",
      contactCopy: (
        <>
          Máte otázky? Napíšte nám na{" "}
          <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
            {CONTACT_EMAIL}
          </Link>{" "}
          alebo zavolajte na{" "}
          <Link href={`tel:${CONTACT_PHONE}`} style={styles.link}>
            {CONTACT_PHONE}
          </Link>
          .
        </>
      ),
      closingLines: ["S pozdravom,", "Tím Teherguminet.hu"],
      footer:
        "Toto je automaticky generovaná správa, prosím, neodpovedajte na ňu.",
    },
  }

  const lang = languageBlocks[languageCode] ?? languageBlocks.hu

  const deliveredAt = fulfillment?.delivered_at
    ? new Date(fulfillment.delivered_at)
    : null
  const deliveredAtText = deliveredAt
    ? deliveredAt.toLocaleString(lang.locale)
    : lang.deliveredFallback

  const shippingMethodName = fulfillment?.shipping_option_name?.trim() || null
  const trackingNumbers = (fulfillment?.tracking_numbers ?? [])
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)

  const orderUrl = buildOrderUrl(orderId, languageCode)

  const details = [
    { label: lang.labels.order, value: orderId },
    { label: lang.labels.deliveredAt, value: deliveredAtText },
  ]

  if (shippingMethodName) {
    details.push({
      label: lang.labels.shippingMethod,
      value: shippingMethodName,
    })
  }

  if (trackingNumbers.length) {
    details.push({
      label: lang.labels.tracking,
      value: trackingNumbers.join(", "),
    })
  }

  return (
    <Html>
      <Head />
      <Preview>{lang.preview(orderId)}</Preview>

      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <Section style={styles.header}>
              <Link href="https://teherguminet.hu" style={styles.brand}>
                TEHERGUMINET.HU
              </Link>
              <Heading style={styles.title}>{lang.heading}</Heading>
              <Text style={styles.subtitle}>
                {lang.intro(customerName, orderId)}
              </Text>
            </Section>

            <Hr style={styles.divider} />

            <Section style={styles.content}>
              <Section style={styles.detailCard}>
                <table
                  role="presentation"
                  width="100%"
                  cellPadding="0"
                  cellSpacing="0"
                  style={{ width: "100%", borderCollapse: "collapse" }}
                >
                  <tbody>
                    {details.map((detail) => (
                      <tr key={detail.label}>
                        <td style={{ paddingBottom: "10px" }}>
                          <Text style={styles.label}>{detail.label}</Text>
                          <Text style={styles.value}>{detail.value}</Text>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              <Section style={styles.ctaWrap}>
                <Button href={orderUrl} style={styles.cta}>
                  {lang.ctaLabel}
                </Button>
                <Text style={styles.muted}>
                  {lang.code === "hu"
                    ? "Ha a gomb nem működik:"
                    : "Ak tlačidlo nefunguje:"}{" "}
                  <Link href={orderUrl} style={styles.link}>
                    {orderUrl}
                  </Link>
                </Text>
              </Section>

              <Text style={styles.subtitle}>{lang.contactCopy}</Text>

              <Text style={{ ...styles.subtitle, marginTop: "12px" }}>
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
  )
}

export const mockOrderDelivered: OrderDeliveredEmailProps = {
  order: {
    id: "order_01JSNXDH9BPJWWKVW03B9E9KW8",
    display_id: 19,
    email: "partner@teherguminet.hu",
    currency_code: "eur",
    total: 896742,
    subtotal: 706096,
    shipping_total: 0,
    item_total: 706096,
    customer: {
      first_name: "Partner",
    },
  },
  fulfillment: {
    delivered_at: new Date().toISOString(),
    shipping_option_name: "GLS házhozszállítás",
    tracking_numbers: ["GLS123456789"],
  },
}

// @ts-ignore - consumed by React Email dev server
export default () => <OrderDeliveredEmail {...mockOrderDelivered} />
