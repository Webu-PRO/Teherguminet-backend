import type { ReactNode } from "react"
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components"
import {
  LanguageCode,
  resolveLanguageFromHints,
} from "../email-language"

export type AbandonedCartEmailProps = {
  customerName?: string | null
  recoverUrl: string
  currencyCode?: string | null
  language?: string | null
  countryCode?: string | null
  storefrontUrl?: string | null
  supportEmail?: string | null
  supportPhone?: string | null
  items?: Array<{
    id: string
    title?: string | null
    quantity?: number | null
    unit_price?: number | null
    thumbnail?: string | null
  }>
}

const PANEL_BG =
  "radial-gradient(circle at top, rgba(225,6,0,0.35), rgba(8,8,13,1) 60%)"

const formatAmount = (
  value?: number | null,
  currencyCode?: string | null,
  locale: string = "hu-HU"
) => {
  if (typeof value !== "number") {
    return "—"
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: (currencyCode || "EUR").toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value / 100)
  } catch {
    return `${(value / 100).toFixed(2)} ${(currencyCode || "EUR").toUpperCase()}`
  }
}

type LanguageBlock = {
  code: LanguageCode
  locale: string
  preview: string
  heroTitle: string
  heroLead: (name: string) => ReactNode
  ctaLabel: string
  cartDetailsHeading: string
  itemFallbackTitle: string
  itemFallbackThumbnail: string
  quantitySuffix: string
  emptyCart: string
  tipsHeading: string
  tips: string[]
  supportIntro: string
  supportOutro: string
  footer: string
  nameFallback: string
  supportAccent: string
}

const languageBlocks: Record<LanguageCode, LanguageBlock> = {
  hu: {
    code: "hu",
    locale: "hu-HU",
    preview: "Ne feledd a kosarad – fejezd be a rendelést!",
    heroTitle: "A kosarad még vár rád",
    heroLead: (name) => (
      <>
        Szia {name}, néhány kattintással befejezheted a rendelést.
      </>
    ),
    ctaLabel: "Vissza a kosárhoz",
    cartDetailsHeading: "Kosár részletei",
    itemFallbackTitle: "Termék",
    itemFallbackThumbnail: "Nincs kép",
    quantitySuffix: "db",
    emptyCart:
      "A kosarad üresnek tűnik, de bármikor visszatérhetsz böngészni.",
    tipsHeading: "Tippek",
    tips: [
      "A termékek elérhetősége folyamatosan változik – ha szükséged van rájuk, érdemes most leadni a rendelést.",
      "Ha kérdésed van a rendeléshez, szólj nekünk bátran, szívesen segítünk.",
    ],
    supportIntro: "Kérdésed van? Írj nekünk a",
    supportOutro: "címen vagy hívj minket a",
    footer:
      "Ez egy automatikusan küldött értesítés, kérjük ne válaszolj rá közvetlenül.",
    nameFallback: "Partnerünk",
    supportAccent: "#f75858",
  },
  sk: {
    code: "sk",
    locale: "sk-SK",
    preview: "Nezabudnite na svoj košík – dokončite objednávku!",
    heroTitle: "Váš košík ešte čaká",
    heroLead: (name) => (
      <>
        Ahoj {name}, stačí pár klikov a objednávka je hotová.
      </>
    ),
    ctaLabel: "Späť do košíka",
    cartDetailsHeading: "Detaily košíka",
    itemFallbackTitle: "Produkt",
    itemFallbackThumbnail: "Bez obrázka",
    quantitySuffix: "ks",
    emptyCart:
      "Zdá sa, že košík je prázdny – môžete sa kedykoľvek vrátiť.",
    tipsHeading: "Tipy",
    tips: [
      "Dostupnosť pneumatík sa môže meniť, preto odporúčame dokončiť objednávku čo najskôr.",
      "Ak máte otázky k objednávke, radi vám pomôžeme.",
    ],
    supportIntro: "Potrebujete pomoc? Napíšte nám na",
    supportOutro: "alebo zavolajte na",
    footer:
      "Toto je automaticky odoslané upozornenie, prosíme neodpovedajte naň.",
    nameFallback: "Partner",
    supportAccent: "#4da3ff",
  },
}

export const AbandonedCartEmail = ({
  customerName,
  recoverUrl,
  currencyCode,
  language,
  countryCode,
  storefrontUrl,
  supportEmail = "hello@tehergumi.net",
  supportPhone = "+36 1 234 5678",
  items = [],
}: AbandonedCartEmailProps) => {
  const languageCode = resolveLanguageFromHints({
    language,
    countryCode,
    currencyCode,
  })
  const lang = languageBlocks[languageCode] ?? languageBlocks.hu

  const safeName =
    customerName?.trim() && customerName.trim().length
      ? customerName.trim()
      : lang.nameFallback

  const previewText = lang.preview

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-[#050507] px-4 py-8 font-sans text-white">
          <Container className="mx-auto my-0 w-full max-w-[620px] rounded-[32px] border border-white/10 bg-[#0b0d13] p-0 shadow-[0_25px_60px_rgba(0,0,0,0.65)]">
            <Section
              style={{
                background: PANEL_BG,
                borderTopLeftRadius: "32px",
                borderTopRightRadius: "32px",
              }}
              className="px-9 py-10 text-center"
            >
              <Text className="text-[11px] font-semibold uppercase tracking-[0.4em] text-white/60">
                Tehergumi.net
              </Text>
              <Heading className="mt-4 text-[27px] font-semibold leading-snug text-white">
                {lang.heroTitle}
              </Heading>
              <Text className="mx-auto mt-4 max-w-[420px] text-[15px] leading-6 text-white/85">
                {lang.heroLead(safeName)}
              </Text>
              <Button
                href={recoverUrl}
                className="mt-6 inline-block rounded-full bg-[#e10600] px-8 py-3 text-[14px] font-semibold text-white no-underline shadow-[0_15px_35px_rgba(225,6,0,0.45)]"
              >
                {lang.ctaLabel}
              </Button>
              {storefrontUrl ? (
                <Text className="mt-4 text-[12px] uppercase tracking-[0.2em] text-white/50">
                  {storefrontUrl.replace(/^https?:\/\//, "")}
                </Text>
              ) : null}
            </Section>

            <Section className="px-8 py-8">
              <Heading className="text-[16px] font-semibold uppercase tracking-[0.25em] text-white/70">
                {lang.cartDetailsHeading}
              </Heading>
              <Section className="mt-4 space-y-3">
                {items.length ? (
                  items.map((item) => (
                    <Section
                      key={item.id}
                      className="flex flex-row items-center gap-4 rounded-2xl border border-white/6 bg-[rgba(255,255,255,0.02)] px-4 py-4"
                    >
                      <div className="flex h-[64px] w-[64px] items-center justify-center rounded-xl border border-white/5 bg-white/5">
                        {item.thumbnail ? (
                          <img
                            src={item.thumbnail}
                            width="64"
                            height="64"
                            alt={item.title ?? lang.itemFallbackTitle}
                            style={{
                              borderRadius: "12px",
                              objectFit: "cover",
                              width: "64px",
                              height: "64px",
                            }}
                          />
                        ) : (
                          <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                            {lang.itemFallbackThumbnail}
                          </span>
                        )}
                      </div>
                      <div>
                        <Text className="m-0 text-[15px] font-semibold leading-6 text-white">
                          {item.title ?? lang.itemFallbackTitle}
                        </Text>
                        <Text className="m-0 text-[13px] text-white/70">
                          {formatAmount(
                            item.unit_price,
                            currencyCode,
                            lang.locale
                          )}{" "}
                          · {item.quantity ?? 1} {lang.quantitySuffix}
                        </Text>
                      </div>
                    </Section>
                  ))
                ) : (
                  <Text className="rounded-2xl border border-dashed border-white/20 px-5 py-4 text-[14px] text-white/70">
                    {lang.emptyCart}
                  </Text>
                )}
              </Section>

              <Section className="mt-6 rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.02)] px-5 py-6">
                <Heading className="text-[15px] font-semibold uppercase tracking-[0.18em] text-white/70">
                  {lang.tipsHeading}
                </Heading>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[13px] text-white/80">
                  {lang.tips.map((tip, index) => (
                    <li key={`${lang.code}-tip-${index}`}>{tip}</li>
                  ))}
                </ul>
              </Section>

              <Section className="mt-8 rounded-2xl border border-white/5 bg-[rgba(255,255,255,0.02)] px-6 py-6 text-center">
                <Text className="text-[13px] leading-6 text-white/80">
                  {lang.supportIntro}{" "}
                  <a
                    href={`mailto:${supportEmail}`}
                    style={{
                      color: lang.supportAccent,
                      textDecoration: "none",
                    }}
                  >
                    {supportEmail}
                  </a>{" "}
                  {lang.supportOutro} {supportPhone}.
                </Text>
              </Section>
            </Section>

            <Hr className="border-t border-white/10" />

            <Section className="px-8 pb-8 pt-6 text-center">
              <Text className="text-[12px] leading-5 text-white/45">
                {lang.footer}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

export const abandonedCartEmail = (props: AbandonedCartEmailProps) => (
  <AbandonedCartEmail {...props} />
)

const mockProps: AbandonedCartEmailProps = {
  customerName: "Partner",
  recoverUrl: "https://therguminet.hu/cart/recover/cart_123",
  currencyCode: "HUF",
  storefrontUrl: "https://therguminet.hu",
  items: [
    {
      id: "item_1",
      title: "Michelin X Multi Z 315/80 R22.5",
      quantity: 4,
      unit_price: 187000,
      thumbnail:
        "https://cdn11.bigcommerce.com/s-ykpvhku8bx/images/stencil/original/products/114/498/retread-tires.1__59244.1562264741.png",
    },
  ],
}

// @ts-ignore - consumed by React Email dev server
export default () => <AbandonedCartEmail {...mockProps} />
