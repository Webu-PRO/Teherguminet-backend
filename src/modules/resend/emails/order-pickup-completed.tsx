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

export type OrderPickupCompletedEmailProps = {
  order: OrderEmailOrder
}

const BRAND_URL = "https://teherguminet.hu"
const PICKUP_ADDRESS = "2884, Bakonyszombathely Bem utca 36."
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
  topRow: {
    backgroundColor: "#f6f6f6",
    borderBottom: "1px solid #e5e5e5",
    padding: "18px 22px",
  } as React.CSSProperties,
  topLabel: {
    margin: 0,
    fontSize: "14px",
    lineHeight: "20px",
    fontWeight: 700,
    color: "#1a1a1a",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  topValue: {
    margin: "8px 0 0",
    fontSize: "16px",
    lineHeight: "22px",
    fontWeight: 600,
    color: "#7a7a7a",
    letterSpacing: "0.01em",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  topButton: {
    backgroundColor: F1_RED,
    borderRadius: "4px",
    border: "1px solid #b70500",
    color: "#ffffff",
    fontSize: "18px",
    fontWeight: 700,
    textDecoration: "none",
    display: "inline-block",
    padding: "14px 28px",
    fontFamily: FONT_STACK,
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  hero: {
    padding: "34px 22px 28px",
    textAlign: "center",
    borderBottom: "1px solid #e8e8e8",
  } as React.CSSProperties,
  brand: {
    margin: 0,
    fontSize: "28px",
    lineHeight: "32px",
    fontWeight: 700,
    color: "#111111",
    textDecoration: "none",
    display: "inline-block",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  heading: {
    margin: "16px 0 0",
    fontSize: "42px",
    lineHeight: "46px",
    letterSpacing: "-0.02em",
    fontWeight: 800,
    color: "#111111",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  heroText: {
    margin: "16px auto 0",
    maxWidth: "510px",
    fontSize: "22px",
    lineHeight: "32px",
    fontWeight: 500,
    color: "#666666",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  content: {
    padding: "20px 22px 22px",
  } as React.CSSProperties,
  panel: {
    borderTop: "1px solid #ececec",
    paddingTop: "16px",
    marginTop: "16px",
  } as React.CSSProperties,
  label: {
    margin: 0,
    fontSize: "13px",
    lineHeight: "18px",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#8a8a8a",
    fontFamily: FONT_STACK,
    fontWeight: 700,
  } as React.CSSProperties,
  value: {
    margin: "8px 0 0",
    fontSize: "20px",
    lineHeight: "28px",
    fontWeight: 700,
    color: "#171717",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  text: {
    margin: "10px 0 0",
    fontSize: "18px",
    lineHeight: "28px",
    color: "#2a2a2a",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  link: {
    color: "#111111",
    textDecoration: "underline",
    wordBreak: "break-word",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  ctaWrap: {
    marginTop: "20px",
  } as React.CSSProperties,
  cta: {
    backgroundColor: F1_RED,
    borderRadius: "4px",
    border: "1px solid #b70500",
    color: "#ffffff",
    fontSize: "18px",
    fontWeight: 700,
    textDecoration: "none",
    display: "inline-block",
    padding: "14px 26px",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  muted: {
    margin: "12px 0 0",
    fontSize: "14px",
    lineHeight: "22px",
    color: "#6a6a6a",
    fontFamily: FONT_STACK,
    wordBreak: "break-word",
  } as React.CSSProperties,
  helpHeading: {
    margin: "22px 0 0",
    fontSize: "20px",
    lineHeight: "24px",
    fontWeight: 700,
    color: "#171717",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  helpGrid: {
    marginTop: "10px",
    borderTop: "1px solid #ededed",
    paddingTop: "12px",
  } as React.CSSProperties,
  helpItem: {
    margin: "0 16px 8px 0",
    display: "inline-block",
    fontSize: "16px",
    lineHeight: "22px",
    fontWeight: 600,
    color: "#1f1f1f",
    textDecoration: "none",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  footer: {
    textAlign: "center",
    fontSize: "13px",
    lineHeight: "20px",
    color: "#7a7a7a",
    margin: "14px 0 0",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
}

type LanguageBlock = {
  code: LanguageCode
  preview: (orderId: string) => string
  heading: string
  intro: (name: string, orderId: string) => React.ReactNode
  promiseLine: string
  pickupRefLabel: string
  trackCtaLabel: string
  details: {
    customerLabel: string
    orderLabel: string
    pickupAddressLabel: string
    contactLabel: string
  }
  phoneLabel: string
  emailLabel: string
  ctaLabel: string
  fallbackLinkLabel: string
  helpTitle: string
  helpLinks: Array<{
    label: string
    href: string
  }>
  closing: string[]
  footer: string
}

export const OrderPickupCompletedEmail = ({
  order,
}: OrderPickupCompletedEmailProps) => {
  const languageCode = resolveLanguageFromOrder(order)
  const orderId = resolveOrderId(order)
  const customerName = resolveCustomerName(order)
  const orderUrl = buildOrderUrl(order.id, languageCode)

  const languageBlocks: Record<LanguageCode, LanguageBlock> = {
    hu: {
      code: "hu",
      preview: (id) => `Átvétel sikeresen megtörtént: ${id}`,
      heading: "Átvétel sikeres.",
      intro: (name, id) => (
        <>
          Kedves {name}! A rendelésed (<strong>{id}</strong>) átvétele sikeresen
          megtörtént.
        </>
      ),
      promiseLine:
        "Köszönjük a vásárlást. Ha számlával vagy termékkel kapcsolatban kérdésed van, segítünk.",
      pickupRefLabel: "Átvételi azonosító",
      trackCtaLabel: "Rendelés megnyitása",
      details: {
        customerLabel: "Átvételi név",
        orderLabel: "Rendelési azonosító",
        pickupAddressLabel: "Átvétel helye",
        contactLabel: "Kapcsolat",
      },
      phoneLabel: "Telefon",
      emailLabel: "Email",
      ctaLabel: "Rendelés megtekintése",
      fallbackLinkLabel: "Ha a gomb nem működik, nyisd meg ezt:",
      helpTitle: "Segítség",
      helpLinks: [
        { label: "Rendelési előzmények", href: orderUrl },
        { label: "Kapcsolat", href: `mailto:${CONTACT_EMAIL}` },
      ],
      closing: ["Köszönjük a vásárlást!", "A Teherguminet.hu csapata"],
      footer:
        "Ez egy automatikusan generált üzenet, kérjük ne válaszolj rá közvetlenül.",
    },
    sk: {
      code: "sk",
      preview: (id) => `Prevzatie úspešne dokončené: ${id}`,
      heading: "Odber úspešný.",
      intro: (name, id) => (
        <>
          Dobrý deň {name}! Prevzatie vašej objednávky (<strong>{id}</strong>)
          bolo úspešne dokončené.
        </>
      ),
      promiseLine:
        "Ďakujeme za nákup. Ak máte otázky k faktúre alebo produktu, radi vám pomôžeme.",
      pickupRefLabel: "Referenčné číslo odberu",
      trackCtaLabel: "Otvoriť objednávku",
      details: {
        customerLabel: "Meno príjemcu",
        orderLabel: "ID objednávky",
        pickupAddressLabel: "Miesto odberu",
        contactLabel: "Kontakt",
      },
      phoneLabel: "Telefón",
      emailLabel: "Email",
      ctaLabel: "Zobraziť objednávku",
      fallbackLinkLabel: "Ak tlačidlo nefunguje, otvorte tento odkaz:",
      helpTitle: "Pomoc",
      helpLinks: [
        { label: "História objednávok", href: orderUrl },
        { label: "Kontakt", href: `mailto:${CONTACT_EMAIL}` },
      ],
      closing: ["Ďakujeme za váš nákup!", "Tím Teherguminet.hu"],
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
            <Section style={styles.topRow}>
              <table
                width="100%"
                border={0}
                cellPadding={0}
                cellSpacing={0}
                role="presentation"
              >
                <tbody>
                  <tr>
                    <td valign="top" style={{ paddingRight: "8px" }}>
                      <Text style={styles.topLabel}>{lang.pickupRefLabel}</Text>
                      <Text style={styles.topValue}>{orderId}</Text>
                    </td>
                    <td align="right" valign="middle">
                      <Button href={orderUrl} style={styles.topButton}>
                        {lang.trackCtaLabel}
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Section style={styles.hero}>
              <Link href={BRAND_URL} style={styles.brand}>
                Teherguminet
              </Link>
              <Heading style={styles.heading}>{lang.heading}</Heading>
              <Text style={styles.heroText}>{lang.intro(customerName, orderId)}</Text>
              <Text style={styles.heroText}>{lang.promiseLine}</Text>
            </Section>

            <Section style={styles.content}>
              <Section style={styles.panel}>
                <Text style={styles.label}>{lang.details.customerLabel}</Text>
                <Text style={styles.value}>{customerName}</Text>
              </Section>

              <Section style={styles.panel}>
                <Text style={styles.label}>{lang.details.orderLabel}</Text>
                <Text style={styles.value}>{orderId}</Text>
              </Section>

              <Section style={styles.panel}>
                <Text style={styles.label}>{lang.details.pickupAddressLabel}</Text>
                <Text style={styles.text}>{PICKUP_ADDRESS}</Text>
              </Section>

              <Section style={styles.panel}>
                <Text style={styles.label}>{lang.details.contactLabel}</Text>
                <Text style={styles.text}>
                  {lang.phoneLabel}:{" "}
                  <Link href={`tel:${CONTACT_PHONE_LINK}`} style={styles.link}>
                    {CONTACT_PHONE_DISPLAY}
                  </Link>
                </Text>
                <Text style={styles.text}>
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

              <Text style={styles.helpHeading}>{lang.helpTitle}</Text>
              <Section style={styles.helpGrid}>
                {lang.helpLinks.map((help) => (
                  <Link
                    key={`${lang.code}-${help.label}`}
                    href={help.href}
                    style={styles.helpItem}
                  >
                    {help.label}
                  </Link>
                ))}
              </Section>

              <Text style={styles.text}>
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

export const mockOrderPickupCompleted: OrderPickupCompletedEmailProps = {
  order: {
    id: "order_01JSNXDH9BPJWWKVW03B9E9KW8",
    display_id: 27,
    email: "partner@teherguminet.hu",
    customer: {
      first_name: "Partner",
    },
  },
}

// @ts-ignore - consumed by React Email dev server
export default () => <OrderPickupCompletedEmail {...mockOrderPickupCompleted} />
