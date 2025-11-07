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

export type UserInvitedEmailProps = {
  invite_url: string
  email?: string
}

type LanguageTheme = {
  background: string
  borderColor: string
  tagColor: string
  accentColor: string
  buttonBackground: string
  buttonShadow: string
}

const heroCardClasses =
  "rounded-[32px] border border-white/10 bg-gradient-to-br from-[#181b28] via-[#0d0f16] to-[#07070b] px-8 py-10 text-center text-white shadow-[0_30px_60px_rgba(0,0,0,0.55)]"

const metaCardClasses =
  "rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left"

const metaLabelClasses =
  "text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60"

const metaValueClasses = "mt-2 text-lg font-semibold text-white"

const baseTextClass = "text-[14px] leading-6 text-white/90"

const languageCardBase =
  "my-8 rounded-[26px] border px-6 py-7 text-left text-white shadow-[0_20px_45px_rgba(0,0,0,0.45)]"

const languageTagBase = "text-[12px] font-semibold uppercase tracking-[0.28em]"

export function UserInvitedEmailComponent({
  invite_url,
  email,
}: UserInvitedEmailProps) {
  const greet = (prefix: string) => (email ? `${prefix} ${email}!` : `${prefix}!`)

  const languageSections = [
    {
      code: "hu",
      languageLabel: "Magyar / Hungarian",
      heading: "Meghívót kaptál a Tehergumi.net platformra",
      greeting: greet("Szia"),
      lead:
        "Az alábbi gombbal aktiválhatod hozzáférésedet a flottakezelő és rendeléskövető felülethez.",
      bulletPoints: [
        "A meghívás 72 óráig érvényes, utána új linket kell kérned.",
        "Ugyanazzal az e-mail címmel jelentkezz be, amelyre a meghívót küldtük.",
      ],
      buttonLabel: "Meghívás elfogadása",
      copyIntro: "Ha nem működik a gomb, másold az alábbi URL-t a böngésződbe:",
      note:
        "Ha nem számítottál erre a meghívóra, egyszerűen hagyd figyelmen kívül ezt az üzenetet.",
      theme: {
        background:
          "linear-gradient(135deg, rgba(247,88,88,0.16) 0%, rgba(9,9,12,0.95) 80%)",
        borderColor: "rgba(247,88,88,0.45)",
        tagColor: "rgba(255,212,212,0.85)",
        accentColor: "#f75858",
        buttonBackground: "#f75858",
        buttonShadow: "0 14px 30px rgba(247,88,88,0.45)",
      } satisfies LanguageTheme,
    },
    {
      code: "sk",
      languageLabel: "Slovenčina / Slovak",
      heading: "Pozvánka na platformu Tehergumi.net",
      greeting: greet("Ahoj"),
      lead:
        "Pomocou tlačidla nižšie aktivujete prístup do správy flotily a sledovania objednávok.",
      bulletPoints: [
        "Pozvánka je platná 72 hodín, potom je potrebné vyžiadať si novú.",
        "Prihláste sa s rovnakou e-mailovou adresou, na ktorú sme poslali pozvánku.",
      ],
      buttonLabel: "Prijať pozvánku",
      copyIntro: "Ak tlačidlo nefunguje, skopírujte túto adresu URL do prehliadača:",
      note:
        "Ak ste túto pozvánku neočakávali, môžete tento e-mail bezpečne ignorovať.",
      theme: {
        background:
          "linear-gradient(135deg, rgba(30,140,255,0.16) 0%, rgba(7,7,11,0.95) 80%)",
        borderColor: "rgba(74,163,255,0.45)",
        tagColor: "rgba(210,232,255,0.88)",
        accentColor: "#3f8dff",
        buttonBackground: "#3f8dff",
        buttonShadow: "0 14px 30px rgba(63,141,255,0.45)",
      } satisfies LanguageTheme,
    },
  ]

  const metaTiles = [
    {
      label: "E-mail / Email",
      value: email ?? "—",
    },
    {
      label: "Állapot / Stav",
      value: "Aktív meghívó / Aktívne pozvanie",
    },
  ]

  return (
    <Html>
      <Head />
      <Preview>Meghívó a platformunkra / Pozvánka na našu platformu</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-[#040405] px-4 font-sans text-white">
          <Container className="my-10 w-full max-w-[520px]">
            <Section className={heroCardClasses}>
              <Text className="text-[11px] font-semibold uppercase tracking-[0.4em] text-white/60">
                Tehergumi.net
              </Text>
              <Heading className="mt-4 text-[26px] font-semibold leading-snug text-white">
                B2B meghívó / Pozvánka pre partnerov
              </Heading>
              <Text className="mx-auto mt-4 max-w-[420px] text-[15px] leading-6 text-white/80">
                Meghívunk, hogy csatlakozz a teherabroncs partnereinknek fenntartott
                felülethez. / Pozývame vás do partnerského rozhrania pre nákup a správu
                objednávok.
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
                    href={invite_url}
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
                    href={invite_url}
                    className="break-all text-[14px] leading-6 no-underline"
                    style={{ color: section.theme.accentColor }}
                  >
                    {invite_url}
                  </Link>
                </Section>

                <Section className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <Text className="text-[13px] leading-6 text-white/70">{section.note}</Text>
                </Section>
              </Section>
            ))}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

export const userInvitedEmail = (props: UserInvitedEmailProps) => (
  <UserInvitedEmailComponent {...props} />
)

const mockInvite: UserInvitedEmailProps = {
  invite_url: "https://your-app.com/app/invite/sample-token-123",
  email: "user@example.com",
}

// @ts-ignore - consumed by React Email dev server
export default () => <UserInvitedEmailComponent {...mockInvite} />
