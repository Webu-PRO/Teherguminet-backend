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
} from "@react-email/components";
import { CONTACT_EMAIL, CONTACT_PHONE, F1_RED } from "./order-email-shared";

export type PasswordResetEmailProps = {
  reset_url: string;
  email?: string | null;
  actor_type?: string | null;
  expires_in_minutes?: number | null;
};

const BRAND_NAME = "Teherguminet.hu";
const DEFAULT_EXPIRY_MINUTES = 15;

const FONT_STACK =
  '"SF Pro Text","SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

const resolveAccountLabel = (actorType?: string | null) => {
  const normalized = (actorType ?? "").toLowerCase();
  if (normalized === "user" || normalized === "admin") return "Admin";
  if (normalized) return normalized;
  return "Customer";
};

type LangSection = {
  code: "hu" | "sk";
  languageLabel: string;
  heading: string;
  greeting: string;
  lead: string;
  bulletPoints: string[];
  buttonLabel: string;
  copyIntro: string;
  accent: string; // only color accent (still white/black design)
};

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
    fontWeight: 700,
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
    fontWeight: 700,
    margin: 0,
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
  h2: {
    margin: "10px 0 0",
    fontSize: "18px",
    lineHeight: "24px",
    fontWeight: 700,
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
  ctaWrap: {
    marginTop: "14px",
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
  footer: {
    textAlign: "center",
    fontSize: "12px",
    lineHeight: "18px",
    color: "#6B7280",
    margin: "16px 0 0",
    fontFamily: FONT_STACK,
  } as React.CSSProperties,
};

export const PasswordResetEmail = ({
  reset_url,
  email,
  actor_type,
  expires_in_minutes,
}: PasswordResetEmailProps) => {
  const expiryMinutes =
    typeof expires_in_minutes === "number" &&
    Number.isFinite(expires_in_minutes)
      ? Math.max(1, Math.round(expires_in_minutes))
      : DEFAULT_EXPIRY_MINUTES;

  const previewText =
    "Jelszó visszaállítása / Obnovenie hesla – kattints a linkre a folytatáshoz";

  const languageSections: LangSection[] = [
    {
      code: "hu",
      languageLabel: "Magyar / Hungarian",
      heading: "Jelszó visszaállítása",
      greeting: "Szia!",
      lead: "Az alábbi gombbal visszaállíthatod a jelszavadat. A link csak rövid ideig érvényes.",
      bulletPoints: [
        `A link ${expiryMinutes} percig érvényes.`,
        "Ha nem te kérted a jelszó-visszaállítást, nyugodtan hagyd figyelmen kívül ezt az üzenetet.",
      ],
      buttonLabel: "Új jelszó beállítása",
      copyIntro: "Ha nem működik a gomb, másold be ezt a linket a böngészőbe:",
      accent: "#E10600",
    },
    {
      code: "sk",
      languageLabel: "Slovenčina / Slovak",
      heading: "Obnovenie hesla",
      greeting: "Ahoj!",
      lead: "Klikni na tlačidlo nižšie a nastav si nové heslo. Odkaz je platný len krátku dobu.",
      bulletPoints: [
        `Odkaz je platný ${expiryMinutes} minút.`,
        "Ak si o obnovu nežiadal, tento e-mail môžeš bezpečne ignorovať.",
      ],
      buttonLabel: "Nastaviť nové heslo",
      copyIntro: "Ak tlačidlo nefunguje, skopíruj tento odkaz do prehliadača:",
      accent: "#3F8DFF",
    },
  ];

  const metaTiles = [
    { label: "E-mail / Email", value: email ?? "—" },
    { label: "Fiók / Konto", value: resolveAccountLabel(actor_type) },
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
              <Link href="https://teherguminet.hu" style={styles.brand}>
                {BRAND_NAME.toUpperCase()}
              </Link>
              <Heading style={styles.title}>
                Jelszó visszaállítása / Obnovenie hesla
              </Heading>
              <Text style={styles.subtitle}>
                Biztonságos jelszó-visszaállítás a Teherguminet.hu fiókhoz.
              </Text>
            </Section>

            <Hr style={styles.divider} />

            {/* Meta */}
            <Section style={styles.content}>
              <table
                role="presentation"
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{ width: "100%", borderCollapse: "collapse" }}
              >
                <tbody>
                  <tr>
                    <td style={{ paddingRight: "8px", paddingBottom: "8px" }}>
                      <Section style={styles.metaCard}>
                        <Text style={styles.metaLabel}>
                          {metaTiles[0].label}
                        </Text>
                        <Text style={styles.metaValue}>
                          {metaTiles[0].value}
                        </Text>
                      </Section>
                    </td>
                    <td style={{ paddingLeft: "8px", paddingBottom: "8px" }}>
                      <Section style={styles.metaCard}>
                        <Text style={styles.metaLabel}>
                          {metaTiles[1].label}
                        </Text>
                        <Text style={styles.metaValue}>
                          {metaTiles[1].value}
                        </Text>
                      </Section>
                    </td>
                  </tr>
                </tbody>
              </table>

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

                  <Section style={styles.ctaWrap}>
                    <Button href={reset_url} style={styles.cta}>
                      {section.buttonLabel}
                    </Button>
                  </Section>

                  <Text style={styles.helper}>{section.copyIntro}</Text>
                  <Link
                    href={reset_url}
                    style={{ ...styles.link, color: section.accent }}
                  >
                    {reset_url}
                  </Link>
                </Section>
              ))}
            </Section>
          </Section>

          <Text style={styles.footer}>
            {languageSections[0].code === "hu"
              ? "Ez egy automatikusan generált üzenet, kérjük ne válaszolj rá közvetlenül."
              : "Toto je automaticky generovaná správa, prosím, neodpovedajte na ňu."}
            <br />
            <span>
              Kapcsolat / Kontakt:{" "}
              <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
                {CONTACT_EMAIL}
              </Link>{" "}
              ·{" "}
              <Link href={`tel:${CONTACT_PHONE}`} style={styles.link}>
                {CONTACT_PHONE}
              </Link>
            </span>
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const mockProps: PasswordResetEmailProps = {
  reset_url: "https://admin.teherguminet.hu/app/reset-password?token=demo",
  email: "user@example.com",
  actor_type: "user",
  expires_in_minutes: 15,
};

// @ts-ignore - consumed by React Email dev server
export default () => <PasswordResetEmail {...mockProps} />;
