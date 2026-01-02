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
  Tailwind,
  Text,
} from "@react-email/components"

export type PasswordResetEmailProps = {
  reset_url: string
  email?: string | null
  actor_type?: string | null
  expires_in_minutes?: number | null
}

const BRAND_NAME = "Tehergumi.net"
const DEFAULT_EXPIRY_MINUTES = 15

const heroCardClasses =
  "rounded-[30px] border border-white/10 bg-gradient-to-br from-[#1b1f2e] via-[#0c0e14] to-[#050509] px-8 py-10 text-center text-white shadow-[0_26px_60px_rgba(0,0,0,0.55)]"

const metaCardClasses =
  "rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left"

const metaLabelClasses =
  "text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60"

const metaValueClasses = "mt-2 text-base font-semibold text-white"

const baseTextClass = "text-[14px] leading-6 text-white/90"

const languageCardBase =
  "my-8 rounded-[26px] border px-6 py-7 text-left text-white shadow-[0_20px_45px_rgba(0,0,0,0.45)]"

const languageTagBase = "text-[12px] font-semibold uppercase tracking-[0.28em]"

const resolveAccountLabel = (actorType?: string | null) => {
  const normalized = (actorType ?? "").toLowerCase()
  if (normalized === "user" || normalized === "admin") {
    return "Admin"
  }
  if (normalized) {
    return normalized
  }
  return "Customer"
}

export const PasswordResetEmail = ({
  reset_url,
  email,
  actor_type,
  expires_in_minutes,
}: PasswordResetEmailProps) => {
  const expiryMinutes =
    typeof expires_in_minutes === "number" && Number.isFinite(expires_in_minutes)
      ? Math.max(1, Math.round(expires_in_minutes))
      : DEFAULT_EXPIRY_MINUTES

  const previewText =
    "Jelszo visszaallitasa / Obnovenie hesla – kattints a linkre a folytatashoz"

  const languageSections = [
    {
      code: "hu",
      languageLabel: "Magyar / Hungarian",
      heading: "Jelszo visszaallitasa",
      greeting: "Szia!",
      lead:
        "Az alabbi gombbal visszaallithatod a jelszavadat. A link csak rovid ideig ervenyes.",
      bulletPoints: [
        `A link ${expiryMinutes} percig ervenyes.`,
        "Ha nem te kertel jelszo-visszaallitast, nyugodtan hagyd figyelmen kivul ezt az uzenetet.",
      ],
      buttonLabel: "Uj jelszo beallitasa",
      copyIntro: "Ha nem mukodik a gomb, masold be ezt a linket a bongeszodbe:",
      theme: {
        background:
          "linear-gradient(135deg, rgba(225,6,0,0.2) 0%, rgba(8,8,12,0.95) 80%)",
        borderColor: "rgba(225,6,0,0.5)",
        tagColor: "rgba(255,214,214,0.88)",
        accentColor: "#e10600",
        buttonBackground: "#e10600",
        buttonShadow: "0 14px 30px rgba(225,6,0,0.45)",
      },
    },
    {
      code: "sk",
      languageLabel: "Slovencina / Slovak",
      heading: "Obnovenie hesla",
      greeting: "Ahoj!",
      lead:
        "Klikni na tlacidlo nizsie a nastav si nove heslo. Odkaz je platny len kratku dobu.",
      bulletPoints: [
        `Odkaz je platny ${expiryMinutes} minut.`,
        "Ak si o obnovu neziadal, tento e-mail mozes bezpecne ignorovat.",
      ],
      buttonLabel: "Nastavit nove heslo",
      copyIntro: "Ak tlacidlo nefunguje, skopiruj tento odkaz do prehliadaca:",
      theme: {
        background:
          "linear-gradient(135deg, rgba(63,141,255,0.18) 0%, rgba(7,7,11,0.95) 80%)",
        borderColor: "rgba(74,163,255,0.45)",
        tagColor: "rgba(210,232,255,0.88)",
        accentColor: "#3f8dff",
        buttonBackground: "#3f8dff",
        buttonShadow: "0 14px 30px rgba(63,141,255,0.45)",
      },
    },
  ]

  const metaTiles = [
    {
      label: "E-mail / Email",
      value: email ?? "—",
    },
    {
      label: "Fiok / Konto",
      value: resolveAccountLabel(actor_type),
    },
  ]

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-[#050507] px-4 font-sans text-white">
          <Container className="my-10 w-full max-w-[520px]">
            <Section className={heroCardClasses}>
              <Text className="text-[11px] font-semibold uppercase tracking-[0.4em] text-white/60">
                {BRAND_NAME}
              </Text>
              <Heading className="mt-4 text-[26px] font-semibold leading-snug text-white">
                Jelszo visszaallitasa / Obnovenie hesla
              </Heading>
              <Text className="mx-auto mt-4 max-w-[420px] text-[15px] leading-6 text-white/80">
                Biztonsagos jelszo-visszaallitas a Tehergumi.net fiokhoz.
              </Text>

              <Section className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
                {metaTiles.map((tile) => (
                  <Section key={tile.label} className={metaCardClasses}>
                    <Text className={metaLabelClasses}>{tile.label}</Text>
                    <Text className={metaValueClasses}>{tile.value}</Text>
                  </Section>
                ))}
              </Section>
            </Section>

            {languageSections.map((section, index) => (
              <Section
                key={section.code}
                className={`${languageCardBase} ${index > 0 ? "mt-10" : ""}`}
                style={{
                  background: section.theme.background,
                  borderColor: section.theme.borderColor,
                }}
              >
                <Text
                  className={languageTagBase}
                  style={{ color: section.theme.tagColor }}
                >
                  {section.languageLabel}
                </Text>
                <Heading className="mt-3 text-[24px] font-semibold leading-tight text-white">
                  {section.heading}
                </Heading>

                <Section className="my-5 space-y-3">
                  <Text className={baseTextClass}>{section.greeting}</Text>
                  <Text className={baseTextClass}>{section.lead}</Text>
                  <Section className="space-y-2">
                    {section.bulletPoints.map((item, idx) => (
                      <Text key={`${section.code}-bullet-${idx}`} className={baseTextClass}>
                        • {item}
                      </Text>
                    ))}
                  </Section>
                </Section>

                <Section className="my-6 text-center">
                  <Button
                    href={reset_url}
                    className="rounded-full px-6 py-3 text-center text-[13px] font-semibold text-white no-underline"
                    style={{
                      background: section.theme.buttonBackground,
                      boxShadow: section.theme.buttonShadow,
                    }}
                  >
                    {section.buttonLabel}
                  </Button>
                </Section>

                <Section className="my-5 space-y-3">
                  <Text className={baseTextClass}>{section.copyIntro}</Text>
                  <Link
                    href={reset_url}
                    className="break-all text-[14px] leading-6 no-underline"
                    style={{ color: section.theme.accentColor }}
                  >
                    {reset_url}
                  </Link>
                </Section>
              </Section>
            ))}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

const mockProps: PasswordResetEmailProps = {
  reset_url: "https://admin.teherguminet.hu/app/reset-password?token=demo",
  email: "user@example.com",
  actor_type: "user",
  expires_in_minutes: 15,
}

// @ts-ignore - consumed by React Email dev server
export default () => <PasswordResetEmail {...mockProps} />
