import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components"

export type AbandonedCartEmailProps = {
  customerName?: string | null
  recoverUrl: string
  currencyCode?: string | null
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
const CARD_BG = "rgba(13,14,21,0.92)"

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

export const AbandonedCartEmail = ({
  customerName,
  recoverUrl,
  currencyCode,
  storefrontUrl,
  supportEmail = "hello@tehergumi.net",
  supportPhone = "+36 1 234 5678",
  items = [],
}: AbandonedCartEmailProps) => {
  const safeName =
    customerName?.trim() && customerName.trim().length
      ? customerName.trim()
      : "Partnerünk"

  const previewText =
    "Ne feledd a kosarad / Nezabudnite na svoj košík – fejezd be a rendelést!"

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
                A kosarad még vár rád / Váš košík ešte čaká
              </Heading>
              <Text className="mx-auto mt-4 max-w-[420px] text-[15px] leading-6 text-white/85">
                Szia {safeName}, néhány kattintással befejezheted a rendelést.
                <br />
                Ahoj {safeName}, stačí pár klikov a objednávka je hotová.
              </Text>
              <Button
                href={recoverUrl}
                className="mt-6 inline-block rounded-full bg-[#e10600] px-8 py-3 text-[14px] font-semibold text-white no-underline shadow-[0_15px_35px_rgba(225,6,0,0.45)]"
              >
                Vissza a kosárhoz / Späť do košíka
              </Button>
              {storefrontUrl ? (
                <Text className="mt-4 text-[12px] uppercase tracking-[0.2em] text-white/50">
                  {storefrontUrl.replace(/^https?:\/\//, "")}
                </Text>
              ) : null}
            </Section>

            <Section className="px-8 py-8">
              <Heading className="text-[16px] font-semibold uppercase tracking-[0.25em] text-white/70">
                Kosár részletei / Detaily košíka
              </Heading>
              <Section className="mt-4 space-y-3">
                {items.length ? (
                  items.map((item) => (
                    <Row
                      key={item.id}
                      className="items-center rounded-2xl border border-white/6 bg-[rgba(255,255,255,0.02)] p-4"
                    >
                      <Column className="w-[72px]">
                        {item.thumbnail ? (
                          <Img
                            src={item.thumbnail}
                            width="64"
                            height="64"
                            alt={item.title ?? "Product"}
                            className="rounded-xl border border-white/5 object-cover"
                          />
                        ) : (
                          <div className="flex h-[64px] w-[64px] items-center justify-center rounded-xl border border-dashed border-white/10 text-[11px] text-white/40">
                            Nincs kép
                          </div>
                        )}
                      </Column>
                      <Column className="pl-4">
                        <Text className="m-0 text-[15px] font-semibold leading-6 text-white">
                          {item.title ?? "Termék"}
                        </Text>
                        <Text className="m-0 text-[13px] text-white/70">
                          {formatAmount(item.unit_price, currencyCode)} ·{" "}
                          {item.quantity ?? 1} db / ks
                        </Text>
                      </Column>
                    </Row>
                  ))
                ) : (
                  <Text className="rounded-2xl border border-dashed border-white/20 px-5 py-4 text-[14px] text-white/70">
                    A kosarad üresnek tűnik, de bármikor visszatérhetsz böngészni.
                    <br />
                    Zdá sa, že košík je prázdny – môžete sa kedykoľvek vrátiť.
                  </Text>
                )}
              </Section>

              <Section className="mt-6 rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.02)] px-5 py-6">
                <Heading className="text-[15px] font-semibold uppercase tracking-[0.18em] text-white/70">
                  Tippek / Tipy
                </Heading>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[13px] text-white/80">
                  <li>
                    A termékek elérhetősége folyamatosan változik – ha szükséged van rájuk,
                    érdemes most leadni a rendelést.
                  </li>
                  <li>
                    Dostupnosť pneumatík sa môže meniť, preto odporúčame dokončiť objednávku
                    čo najskôr.
                  </li>
                </ul>
              </Section>

              <Section className="mt-8 rounded-2xl border border-white/5 bg-[rgba(255,255,255,0.02)] px-6 py-6 text-center">
                <Text className="text-[13px] leading-6 text-white/80">
                  Kérdésed van? Írj nekünk a{" "}
                  <a
                    href={`mailto:${supportEmail}`}
                    style={{ color: "#f75858", textDecoration: "none" }}
                  >
                    {supportEmail}
                  </a>{" "}
                  címen vagy hívj minket a {supportPhone} számon.
                  <br />
                  Potrebujete pomoc? Napíšte nám na{" "}
                  <a
                    href={`mailto:${supportEmail}`}
                    style={{ color: "#4da3ff", textDecoration: "none" }}
                  >
                    {supportEmail}
                  </a>{" "}
                  alebo zavolajte na {supportPhone}.
                </Text>
              </Section>
            </Section>

            <Hr className="border-t border-white/10" />

            <Section className="px-8 pb-8 pt-6 text-center">
              <Text className="text-[12px] leading-5 text-white/45">
                Ez egy automatikusan küldött értesítés, kérjük ne válaszolj rá közvetlenül.
                <br />
                Toto je automaticky odoslané upozornenie, prosíme neodpovedajte naň.
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
