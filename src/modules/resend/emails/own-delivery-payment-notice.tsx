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

export type OwnDeliveryPaymentNoticeEmailProps = {
  order: OrderEmailOrder
  payment?: {
    id?: string | null
    captured_at?: string | Date | null
  } | null
}

const BRAND_URL = "https://teherguminet.hu"
const CONTACT_PHONE_DISPLAY = "+36 30 204 0053"
const CONTACT_PHONE_LINK = "+36302040053"
const CONTACT_EMAIL = "info@teherguminet.hu"
const FONT_STACK =
  '"Helvetica Neue",Helvetica,Arial,"Nimbus Sans L",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'

const styles = {
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
  promiseLines: string[]
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

export const OwnDeliveryPaymentNoticeEmail = ({
  order,
}: OwnDeliveryPaymentNoticeEmailProps) => {
  const languageCode = resolveLanguageFromOrder(order)
  const orderId = resolveOrderId(order)
  const customerName = resolveCustomerName(order)
  const orderUrl = buildOrderUrl(order.id, languageCode)

  const languageBlocks: Record<LanguageCode, LanguageBlock> = {
    hu: {
      code: "hu",
      preview: (id) => `Saját szállítás: ${id}`,
      heading: "Köszönjük, a fizetésed megérkezett",
      intro: (name, id) => (
        <>
          Kedves {name}! A <strong style={styles.strong}>{id}</strong>{" "}
          rendelésedet rögzítettük saját szállításra.
        </>
      ),
      promiseLines: [
        "A rendelést 2-6 munkanapon belül kiszállítjuk.",
        "A szállítás napján megerősítő emailt küldünk arról, hogy a csomag úton van.",
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
      preview: (id) => `Vlastné doručenie: ${id}`,
      heading: "Ďakujeme, platbu sme prijali",
      intro: (name, id) => (
        <>
          Dobrý deň {name}! Vašu objednávku{" "}
          <strong style={styles.strong}>{id}</strong> sme zaevidovali na
          vlastné doručenie.
        </>
      ),
      promiseLines: [
        "Objednávku doručíme do 2-6 pracovných dní.",
        "V deň doručenia vám pošleme potvrdzovací email, že balík je na ceste.",
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
            <Section style={styles.header}>
              <Link href={BRAND_URL} style={styles.brand}>
                TEHERGUMINET.HU
              </Link>
              <Heading style={styles.title}>{lang.heading}</Heading>
            </Section>

            <Section style={styles.content}>
              <Text style={styles.text}>{lang.intro(customerName, orderId)}</Text>
              {lang.promiseLines.map((line, index) => (
                <Text key={`${lang.code}-promise-${index}`} style={styles.text}>
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

export const mockOwnDeliveryPaymentNotice: OwnDeliveryPaymentNoticeEmailProps =
  {
    order: {
      id: "order_01JSNXDH9BPJWWKVW03B9E9KW8",
      display_id: 19,
      email: "partner@teherguminet.hu",
      customer: {
        first_name: "Partner",
      },
    },
    payment: {
      id: "pay_123",
      captured_at: new Date().toISOString(),
    },
  }

// @ts-ignore - consumed by React Email dev server
export default () => (
  <OwnDeliveryPaymentNoticeEmail {...mockOwnDeliveryPaymentNotice} />
)
