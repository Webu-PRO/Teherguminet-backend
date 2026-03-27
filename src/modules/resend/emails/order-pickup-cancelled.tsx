import * as React from "react"
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import { resolveLanguageFromOrder, type LanguageCode } from "../email-language"
import {
  F1_RED,
  buildOrderUrl,
  resolveCustomerName,
  resolveOrderId,
  type OrderEmailOrder,
} from "./order-email-shared"

export type OrderPickupCancelledEmailProps = {
  order: OrderEmailOrder
}

const BRAND_URL = "https://teherguminet.hu"
const CONTACT_EMAIL = "info@teherguminet.hu"
const FONT_STACK =
  '"Helvetica Neue",Helvetica,Arial,"Nimbus Sans L",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'

const styles = {
  body: {
    backgroundColor: "#f3f3f3",
    margin: 0,
    padding: "22px 0",
    fontFamily: FONT_STACK,
    color: "#111111",
  } as React.CSSProperties,
  container: {
    width: "100%",
    maxWidth: "620px",
    margin: "0 auto",
    padding: "0 14px",
  } as React.CSSProperties,
  card: {
    backgroundColor: "#ffffff",
    border: "1px solid #e4e4e4",
    borderRadius: "6px",
    overflow: "hidden",
  } as React.CSSProperties,
  hero: {
    padding: "26px 22px 18px",
    borderBottom: "1px solid #ececec",
    textAlign: "center",
  } as React.CSSProperties,
  brand: {
    margin: 0,
    fontSize: "28px",
    lineHeight: "32px",
    fontWeight: 700,
    color: "#151515",
    textDecoration: "none",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  badge: {
    margin: "14px auto 0",
    display: "inline-block",
    padding: "6px 12px",
    borderRadius: "999px",
    border: "1px solid #f0b7b7",
    backgroundColor: "#fff1f1",
    color: "#ac1111",
    fontSize: "13px",
    lineHeight: "18px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  heading: {
    margin: "16px 0 0",
    fontSize: "34px",
    lineHeight: "40px",
    fontWeight: 800,
    color: "#101010",
    letterSpacing: "-0.02em",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  content: {
    padding: "20px 22px 22px",
  } as React.CSSProperties,
  text: {
    margin: "0 0 12px",
    fontSize: "18px",
    lineHeight: "28px",
    color: "#282828",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  info: {
    margin: "0 0 14px",
    fontSize: "16px",
    lineHeight: "24px",
    color: "#4a4a4a",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  ctaWrap: {
    marginTop: "18px",
  } as React.CSSProperties,
  cta: {
    backgroundColor: F1_RED,
    borderRadius: "4px",
    border: "1px solid #b70500",
    color: "#ffffff",
    fontSize: "18px",
    lineHeight: "20px",
    fontWeight: 700,
    textDecoration: "none",
    display: "inline-block",
    padding: "13px 24px",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  fallback: {
    margin: "12px 0 0",
    fontSize: "14px",
    lineHeight: "21px",
    color: "#666666",
    fontFamily: FONT_STACK,
    wordBreak: "break-word",
  } as React.CSSProperties,
  link: {
    color: "#111111",
    textDecoration: "underline",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  footer: {
    margin: "14px 0 0",
    textAlign: "center",
    fontSize: "13px",
    lineHeight: "20px",
    color: "#7a7a7a",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
}

type LanguageBlock = {
  preview: (orderId: string) => string
  heading: string
  intro: (name: string, orderId: string) => React.ReactNode
  detailLine: string
  nextStepLine: string
  ctaLabel: string
  fallbackLabel: string
  footer: string
}

const languageBlocks: Record<LanguageCode, LanguageBlock> = {
  hu: {
    preview: (orderId) => `Átvétel visszavonva: ${orderId}`,
    heading: "Átvétel visszavonva",
    intro: (name, orderId) => (
      <>
        Kedves {name}, a <strong>{orderId}</strong> rendelés személyes
        átvételének előkészítését töröltük.
      </>
    ),
    detailLine:
      "A rendelés jelenleg nem átvehető. Új előkészítés esetén külön értesítőt küldünk.",
    nextStepLine:
      "Kérdés esetén írj nekünk az alábbi elérhetőségen, vagy nyisd meg a rendelést.",
    ctaLabel: "Rendelés megnyitása",
    fallbackLabel: "Ha a gomb nem működik, nyisd meg ezt:",
    footer:
      "Ez egy automatikusan generált üzenet, kérjük ne válaszolj rá közvetlenül.",
  },
  sk: {
    preview: (orderId) => `Odber zrušený: ${orderId}`,
    heading: "Odber bol zrušený",
    intro: (name, orderId) => (
      <>
        Dobrý deň {name}, príprava osobného odberu pre objednávku{" "}
        <strong>{orderId}</strong> bola zrušená.
      </>
    ),
    detailLine:
      "Objednávku momentálne nie je možné prevziať. Pri novej príprave vám pošleme ďalšie upozornenie.",
    nextStepLine:
      "V prípade otázok nám napíšte na nižšie uvedený kontakt alebo otvorte objednávku.",
    ctaLabel: "Otvoriť objednávku",
    fallbackLabel: "Ak tlačidlo nefunguje, otvorte tento odkaz:",
    footer:
      "Toto je automaticky generovaná správa, prosím, neodpovedajte na ňu.",
  },
}

export const OrderPickupCancelledEmail = ({
  order,
}: OrderPickupCancelledEmailProps) => {
  const languageCode = resolveLanguageFromOrder(order)
  const orderId = resolveOrderId(order)
  const customerName = resolveCustomerName(order)
  const orderUrl = buildOrderUrl(order.id, languageCode)
  const lang = languageBlocks[languageCode] ?? languageBlocks.hu

  return (
    <Html>
      <Head />
      <Preview>{lang.preview(orderId)}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <Section style={styles.hero}>
              <Link href={BRAND_URL} style={styles.brand}>
                Teherguminet
              </Link>
              <Text style={styles.badge}>Pickup update</Text>
              <Text style={styles.heading}>{lang.heading}</Text>
            </Section>

            <Section style={styles.content}>
              <Text style={styles.text}>{lang.intro(customerName, orderId)}</Text>
              <Text style={styles.info}>{lang.detailLine}</Text>
              <Text style={styles.info}>{lang.nextStepLine}</Text>
              <Text style={styles.info}>
                <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
                  {CONTACT_EMAIL}
                </Link>
              </Text>

              <Section style={styles.ctaWrap}>
                <Button href={orderUrl} style={styles.cta}>
                  {lang.ctaLabel}
                </Button>
                <Text style={styles.fallback}>
                  {lang.fallbackLabel}{" "}
                  <Link href={orderUrl} style={styles.link}>
                    {orderUrl}
                  </Link>
                </Text>
              </Section>
            </Section>
          </Section>

          <Text style={styles.footer}>{lang.footer}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const mockOrderPickupCancelled: OrderPickupCancelledEmailProps = {
  order: {
    id: "order_01JSNXDH9BPJWWKVW03B9E9KW8",
    display_id: 19,
    email: "partner@teherguminet.hu",
    customer: {
      first_name: "Partner",
    },
  },
}

// @ts-ignore - consumed by React Email dev server
export default () => <OrderPickupCancelledEmail {...mockOrderPickupCancelled} />
