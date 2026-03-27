import * as React from "react"
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
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
  F1_RED,
  buildOrderUrl,
  resolveCustomerName,
  resolveOrderId,
  type OrderEmailOrder,
} from "./order-email-shared"

export type OwnDeliveryDeliveredEmailProps = {
  order: OrderEmailOrder
}

const BRAND_URL = "https://teherguminet.hu"
const CONTACT_PHONE_DISPLAY = "+36 30 204 0053"
const CONTACT_PHONE_LINK = "+36302040053"
const CONTACT_EMAIL = "info@teherguminet.hu"
const FONT_STACK =
  '"Helvetica Neue",Helvetica,Arial,"Nimbus Sans L",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'

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
  headerAccent: {
    height: "6px",
    backgroundColor: F1_RED,
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
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  title: {
    margin: "12px 0 0",
    fontSize: "26px",
    lineHeight: "1.15",
    fontWeight: 700,
    color: F1_RED,
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  content: {
    padding: "20px 28px 28px",
  } as React.CSSProperties,
  text: {
    margin: "0 0 12px",
    fontSize: "15px",
    lineHeight: "23px",
    color: "#111111",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  strong: {
    fontWeight: 700,
    color: "#111111",
  } as React.CSSProperties,
  detailCard: {
    marginTop: "8px",
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
    margin: "0 0 12px",
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
  preview: (orderId: string) => string
  heading: string
  intro: (name: string, orderId: string) => React.ReactNode
  successLines: string[]
  details: {
    orderLabel: string
  }
  contactLabel: string
  phoneLabel: string
  emailLabel: string
  ctaLabel: string
  fallbackLinkLabel: string
  closing: string[]
  footer: string
}

export const OwnDeliveryDeliveredEmail = ({
  order,
}: OwnDeliveryDeliveredEmailProps) => {
  const languageCode = resolveLanguageFromOrder(order)
  const orderId = resolveOrderId(order)
  const customerName = resolveCustomerName(order)
  const orderUrl = buildOrderUrl(order.id, languageCode)

  const languageBlocks: Record<LanguageCode, LanguageBlock> = {
    hu: {
      code: "hu",
      preview: (id) => `Sikeres kiszállítás: ${id}`,
      heading: "A szállítás sikeresen megtörtént",
      intro: (name, id) => (
        <>
          Kedves {name}! A <strong style={styles.strong}>{id}</strong>{" "}
          rendelésed sikeresen megérkezett.
        </>
      ),
      successLines: [
        "Köszönjük a rendelésedet!",
        "Bízunk benne, hogy elégedett leszel a termékeinkkel.",
      ],
      details: {
        orderLabel: "Rendelés azonosító",
      },
      contactLabel: "Kapcsolat",
      phoneLabel: "Telefon",
      emailLabel: "Email",
      ctaLabel: "Rendelés megtekintése",
      fallbackLinkLabel: "Ha a gomb nem működik, nyisd meg ezt:",
      closing: ["Üdvözlettel,", "A Teherguminet.hu csapata"],
      footer:
        "Ez egy automatikusan generált üzenet, kérjük ne válaszolj rá közvetlenül.",
    },
    sk: {
      code: "sk",
      preview: (id) => `Doručenie úspešné: ${id}`,
      heading: "Doručenie prebehlo úspešne",
      intro: (name, id) => (
        <>
          Dobrý deň {name}! Vaša objednávka{" "}
          <strong style={styles.strong}>{id}</strong> bola úspešne doručená.
        </>
      ),
      successLines: [
        "Ďakujeme za vašu objednávku.",
        "Veríme, že s našimi produktmi budete spokojní.",
      ],
      details: {
        orderLabel: "ID objednávky",
      },
      contactLabel: "Kontakt",
      phoneLabel: "Telefón",
      emailLabel: "Email",
      ctaLabel: "Zobraziť objednávku",
      fallbackLinkLabel: "Ak tlačidlo nefunguje, otvorte tento odkaz:",
      closing: ["S pozdravom,", "Tím Teherguminet.hu"],
      footer:
        "Toto je automaticky generovaná správa, prosím, neodpovedajte na ňu.",
    },
  }

  const lang = languageBlocks[languageCode] ?? languageBlocks.hu

  return (
    <Html>
      <Head />
      <Preview>{lang.preview(orderId)}</Preview>

      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <Section style={styles.headerAccent} />
            <Section style={styles.header}>
              <Link href={BRAND_URL} style={styles.brand}>
                TEHERGUMINET.HU
              </Link>
              <Heading style={styles.title}>{lang.heading}</Heading>
            </Section>

            <Section style={styles.content}>
              <Text style={styles.text}>{lang.intro(customerName, orderId)}</Text>
              {lang.successLines.map((line, index) => (
                <Text key={`${lang.code}-success-${index}`} style={styles.text}>
                  {line}
                </Text>
              ))}

              <Section style={styles.detailCard}>
                <Text style={styles.label}>{lang.details.orderLabel}</Text>
                <Text style={styles.value}>{orderId}</Text>
                <Text style={styles.label}>{lang.contactLabel}</Text>
                <Text style={{ ...styles.text, marginBottom: "6px" }}>
                  {lang.phoneLabel}:{" "}
                  <Link href={`tel:${CONTACT_PHONE_LINK}`} style={styles.link}>
                    {CONTACT_PHONE_DISPLAY}
                  </Link>
                </Text>
                <Text style={{ ...styles.text, marginBottom: 0 }}>
                  {lang.emailLabel}:{" "}
                  <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
                    {CONTACT_EMAIL}
                  </Link>
                </Text>
              </Section>

              <Section style={styles.ctaWrap}>
                <Button href={orderUrl} style={styles.cta}>
                  {lang.ctaLabel}
                </Button>
                <Text style={styles.muted}>
                  {lang.fallbackLinkLabel}{" "}
                  <Link href={orderUrl} style={styles.link}>
                    {orderUrl}
                  </Link>
                </Text>
              </Section>

              <Text style={{ ...styles.text, marginTop: "14px" }}>
                {lang.closing.map((line, index) => (
                  <React.Fragment key={`${lang.code}-closing-${index}`}>
                    {line}
                    {index < lang.closing.length - 1 ? <br /> : null}
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

export const mockOwnDeliveryDelivered: OwnDeliveryDeliveredEmailProps = {
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
export default () => (
  <OwnDeliveryDeliveredEmail {...mockOwnDeliveryDelivered} />
)
