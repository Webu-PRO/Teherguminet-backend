import * as React from "react";
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

export type UserInvitedEmailProps = {
  invite_url: string;
  email?: string;
};

const BRAND = "Teherguminet.hu";
const FONT_STACK =
  '"SF Pro Text","SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

type LangSection = {
  code: "hu" | "sk";
  languageLabel: string;
  heading: string;
  greeting: string;
  lead: string;
  bulletPoints: string[];
  buttonLabel: string;
  copyIntro: string;
  note: string;
  accent: string; // minimal accent, still white bg + black content
};

const resolveGreeting = (prefix: string, email?: string) =>
  email ? `${prefix} ${email}!` : `${prefix}!`;

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
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    margin: 0,
    color: "#111111",
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
  sectionTag: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    fontWeight: 800,
    margin: 0,
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  h2: {
    margin: "10px 0 0",
    fontSize: "18px",
    lineHeight: "24px",
    fontWeight: 800,
    color: "#111111",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  p: {
    margin: "10px 0 0",
    fontSize: "14px",
    lineHeight: "20px",
    color: "#111111",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  bullet: {
    margin: "8px 0 0",
    fontSize: "14px",
    lineHeight: "20px",
    color: "#111111",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  cta: {
    backgroundColor: "#111111",
    borderRadius: "999px",
    padding: "12px 18px",
    fontSize: "14px",
    fontWeight: 800,
    color: "#ffffff",
    textDecoration: "none",
    display: "inline-block",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  helper: {
    margin: "12px 0 0",
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
  noteBox: {
    marginTop: "12px",
    borderRadius: "14px",
    border: "1px solid #E5E7EB",
    backgroundColor: "#F9FAFB",
    padding: "12px 14px",
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

export function UserInvitedEmailComponent({
  invite_url,
  email,
}: UserInvitedEmailProps) {
  const previewText = "Meghívó a platformunkra / Pozvánka na našu platformu";

  const languageSections: LangSection[] = [
    {
      code: "hu",
      languageLabel: "Magyar / Hungarian",
      heading: "Meghívót kaptál a Teherguminet.hu platformra",
      greeting: resolveGreeting("Szia", email),
      lead: "Az alábbi gombbal aktiválhatod hozzáférésedet a flottakezelő és rendeléskövető felülethez.",
      bulletPoints: [
        "A meghívás 72 óráig érvényes, utána új linket kell kérned.",
        "Ugyanazzal az e-mail címmel jelentkezz be, amelyre a meghívót küldtük.",
      ],
      buttonLabel: "Meghívás elfogadása",
      copyIntro: "Ha nem működik a gomb, másold az alábbi URL-t a böngésződbe:",
      note: "Ha nem számítottál erre a meghívóra, egyszerűen hagyd figyelmen kívül ezt az üzenetet.",
      accent: "#E10600",
    },
    {
      code: "sk",
      languageLabel: "Slovenčina / Slovak",
      heading: "Pozvánka na platformu Teherguminet.hu",
      greeting: resolveGreeting("Ahoj", email),
      lead: "Pomocou tlačidla nižšie aktivujete prístup do správy flotily a sledovania objednávok.",
      bulletPoints: [
        "Pozvánka je platná 72 hodín, potom je potrebné vyžiadať si novú.",
        "Prihláste sa s rovnakou e-mailovou adresou, na ktorú sme poslali pozvánku.",
      ],
      buttonLabel: "Prijať pozvánku",
      copyIntro:
        "Ak tlačidlo nefunguje, skopírujte túto adresu URL do prehliadača:",
      note: "Ak ste túto pozvánku neočakávali, môžete tento e-mail bezpečne ignorovať.",
      accent: "#3F8DFF",
    },
  ];

  const metaTiles = [
    { label: "E-mail / Email", value: email ?? "—" },
    { label: "Állapot / Stav", value: "Aktív meghívó / Aktívne pozvanie" },
  ];

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>

      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            {/* Header */}
            <Section style={styles.header}>
              <Text style={styles.brand}>{BRAND}</Text>
              <Heading style={styles.title}>
                B2B meghívó / Pozvánka pre partnerov
              </Heading>
              <Text style={styles.subtitle}>
                Meghívunk, hogy csatlakozz a partnereinknek fenntartott
                felülethez. / Pozývame vás do partnerského rozhrania pre nákup a
                správu objednávok.
              </Text>
            </Section>

            <Hr style={styles.divider} />

            {/* Content */}
            <Section style={styles.content}>
              {/* Meta */}
              <Row>
                <Column style={{ paddingRight: "8px", paddingBottom: "8px" }}>
                  <Section style={styles.metaCard}>
                    <Text style={styles.metaLabel}>{metaTiles[0].label}</Text>
                    <Text style={styles.metaValue}>{metaTiles[0].value}</Text>
                  </Section>
                </Column>
                <Column style={{ paddingLeft: "8px", paddingBottom: "8px" }}>
                  <Section style={styles.metaCard}>
                    <Text style={styles.metaLabel}>{metaTiles[1].label}</Text>
                    <Text style={styles.metaValue}>{metaTiles[1].value}</Text>
                  </Section>
                </Column>
              </Row>

              {/* Language blocks */}
              {languageSections.map((section) => (
                <Section key={section.code} style={styles.sectionCard}>
                  <Text style={{ ...styles.sectionTag, color: section.accent }}>
                    {section.languageLabel}
                  </Text>
                  <Heading as="h2" style={styles.h2}>
                    {section.heading}
                  </Heading>

                  <Text style={styles.p}>{section.greeting}</Text>
                  <Text style={styles.p}>{section.lead}</Text>

                  <Section style={{ marginTop: "10px" }}>
                    {section.bulletPoints.map((item, idx) => (
                      <Text
                        key={`${section.code}-bp-${idx}`}
                        style={styles.bullet}
                      >
                        • {item}
                      </Text>
                    ))}
                  </Section>

                  <Section style={{ marginTop: "14px" }}>
                    <Button href={invite_url} style={styles.cta}>
                      {section.buttonLabel}
                    </Button>
                  </Section>

                  <Text style={styles.helper}>{section.copyIntro}</Text>
                  <Link
                    href={invite_url}
                    style={{ ...styles.link, color: section.accent }}
                  >
                    {invite_url}
                  </Link>

                  <Section style={styles.noteBox}>
                    <Text style={{ ...styles.muted, margin: 0 }}>
                      {section.note}
                    </Text>
                  </Section>
                </Section>
              ))}
            </Section>
          </Section>

          <Text style={styles.footer}>{previewText}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export const userInvitedEmail = (props: UserInvitedEmailProps) => (
  <UserInvitedEmailComponent {...props} />
);

const mockInvite: UserInvitedEmailProps = {
  invite_url: "https://your-app.com/app/invite/sample-token-123",
  email: "user@example.com",
};

// @ts-ignore - consumed by React Email dev server
export default () => <UserInvitedEmailComponent {...mockInvite} />;
