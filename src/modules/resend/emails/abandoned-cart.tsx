import type { ReactNode } from "react";
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
  Tailwind,
  Text,
} from "@react-email/components";
import { LanguageCode, resolveLanguageFromHints } from "../email-language";
import { F1_RED, formatAmount } from "./order-email-shared";

const FONT_STACK =
  '"Helvetica Neue",Helvetica,Arial,"Nimbus Sans L",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';

export type AbandonedCartEmailProps = {
  customerName?: string | null;
  recoverUrl: string;
  currencyCode?: string | null;
  language?: string | null;
  countryCode?: string | null;
  storefrontUrl?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  items?: Array<{
    id: string;
    title?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    thumbnail?: string | null;
  }>;
};

type LanguageBlock = {
  code: LanguageCode;
  locale: string;
  preview: string;
  heroTitle: string;
  heroLead: (name: string) => ReactNode;
  ctaLabel: string;
  cartDetailsHeading: string;
  itemFallbackTitle: string;
  itemFallbackThumbnail: string;
  quantitySuffix: string;
  emptyCart: string;
  tipsHeading: string;
  tips: string[];
  supportIntro: string;
  supportOutro: string;
  footer: string;
  nameFallback: string;
};

const languageBlocks: Record<LanguageCode, LanguageBlock> = {
  hu: {
    code: "hu",
    locale: "hu-HU",
    preview: "Ne feledd a kosarad – fejezd be a rendelést!",
    heroTitle: "A kosarad még vár rád",
    heroLead: (name) => (
      <>Szia {name}, néhány kattintással befejezheted a rendelést.</>
    ),
    ctaLabel: "Vissza a kosárhoz",
    cartDetailsHeading: "Kosár részletei",
    itemFallbackTitle: "Termék",
    itemFallbackThumbnail: "Nincs kép",
    quantitySuffix: "db",
    emptyCart: "A kosarad üresnek tűnik, de bármikor visszatérhetsz böngészni.",
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
  },
  sk: {
    code: "sk",
    locale: "sk-SK",
    preview: "Nezabudnite na svoj košík – dokončite objednávku!",
    heroTitle: "Váš košík ešte čaká",
    heroLead: (name) => (
      <>Ahoj {name}, stačí pár klikov a objednávka je hotová.</>
    ),
    ctaLabel: "Späť do košíka",
    cartDetailsHeading: "Detaily košíka",
    itemFallbackTitle: "Produkt",
    itemFallbackThumbnail: "Bez obrázka",
    quantitySuffix: "ks",
    emptyCart: "Zdá sa, že košík je prázdny – môžete sa kedykoľvek vrátiť.",
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
  },
};

export const AbandonedCartEmail = ({
  customerName,
  recoverUrl,
  currencyCode,
  language,
  countryCode,
  storefrontUrl,
  supportEmail = "info@teherguminet.hu",
  supportPhone = "+36 30 204 0053",
  items = [],
}: AbandonedCartEmailProps) => {
  const languageCode = resolveLanguageFromHints({
    language,
    countryCode,
    currencyCode,
  });
  const lang = languageBlocks[languageCode] ?? languageBlocks.hu;

  const safeName =
    customerName?.trim() && customerName.trim().length
      ? customerName.trim()
      : lang.nameFallback;
  const brandUrl = storefrontUrl ?? "https://teherguminet.hu";

  return (
    <Html>
      <Preview>{lang.preview}</Preview>

      <Tailwind>
        <Head />
        <Body
          className="m-0 bg-[#eeeeee] px-4 py-10 font-sans text-[#111111]"
          style={{ fontFamily: FONT_STACK }}
        >
          <Container className="mx-auto w-full max-w-[620px] rounded-[24px] border border-[#E5E7EB] bg-white p-0">
            {/* Header */}
            <Section className="bg-white px-10 pt-6 pb-5 border-b border-[#E5E7EB]">
              <Link
                href={brandUrl}
                className="inline-block text-[16px] font-semibold uppercase tracking-[0.22em] text-[#111111] no-underline"
              >
                TEHERGUMINET.HU
              </Link>

              {storefrontUrl ? (
                <Text className="mt-2 text-[12px] text-[#6B7280]">
                  <Link
                    href={storefrontUrl}
                    className="text-[#111111] no-underline"
                  >
                    {storefrontUrl.replace(/^https?:\/\//, "")}
                  </Link>
                </Text>
              ) : (
                <Text className="mt-2 text-[12px] text-[#6B7280]">
                  {lang.preview}
                </Text>
              )}
            </Section>

            {/* Hero */}
            <Section className="px-10 pt-6">
              <Heading className="m-0 text-[28px] font-semibold leading-[1.15] text-[#111111]">
                {lang.heroTitle}
              </Heading>
              <Text className="mt-4 text-[15px] leading-6 text-[#111111]">
                {lang.heroLead(safeName)}
              </Text>

              <Button
                href={recoverUrl}
                style={{ backgroundColor: F1_RED, color: "#ffffff" }}
                className="mt-6 inline-block rounded-[4px] px-8 py-3 text-[14px] font-semibold text-white no-underline"
              >
                {lang.ctaLabel}
              </Button>

              <Text className="mt-3 text-[12px] leading-5 text-[#6B7280]">
                {lang.code === "hu"
                  ? "Ha a gomb nem működik, nyisd meg ezt:"
                  : "Ak tlačidlo nefunguje, otvorte tento odkaz:"}{" "}
                <Link href={recoverUrl} className="text-[#111111] underline">
                  {recoverUrl}
                </Link>
              </Text>
            </Section>

            <Hr className="my-8 border-t border-[#E5E7EB]" />

            {/* Cart */}
            <Section className="px-10">
              <Text className="m-0 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">
                {lang.cartDetailsHeading}
              </Text>

              <Section className="mt-4">
                {items.length ? (
                  <>
                    {items.map((item) => (
                      <Section
                        key={item.id}
                        className="rounded-[16px] border border-[#E5E7EB] bg-white px-4 py-4"
                      >
                        <table
                          role="presentation"
                          width="100%"
                          cellPadding="0"
                          cellSpacing="0"
                          style={{ width: "100%", borderCollapse: "collapse" }}
                        >
                          <tbody>
                            <tr>
                              <td
                                style={{
                                  width: "72px",
                                  paddingRight: "12px",
                                  verticalAlign: "top",
                                }}
                              >
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
                                      display: "block",
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: "64px",
                                      height: "64px",
                                      borderRadius: "12px",
                                      border: "1px solid #E5E7EB",
                                    }}
                                  />
                                )}
                              </td>
                              <td style={{ verticalAlign: "top" }}>
                                <Text className="m-0 text-[15px] font-semibold leading-6 text-[#111111]">
                                  {item.title ?? lang.itemFallbackTitle}
                                </Text>
                                <Text className="m-0 text-[13px] text-[#6B7280]">
                                  {formatAmount(
                                    item.unit_price,
                                    currencyCode ?? "EUR",
                                    lang.locale
                                  )}{" "}
                                  · {item.quantity ?? 1} {lang.quantitySuffix}
                                </Text>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </Section>
                    ))}
                  </>
                ) : (
                  <Section className="rounded-[16px] border border-dashed border-[#D1D5DB] px-5 py-4">
                    <Text className="m-0 text-[14px] leading-6 text-[#6B7280]">
                      {lang.emptyCart}
                    </Text>
                  </Section>
                )}
              </Section>

              {/* Tips */}
              <Section className="mt-6 rounded-[16px] border border-[#E5E7EB] px-6 py-5">
                <Text className="m-0 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">
                  {lang.tipsHeading}
                </Text>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-6 text-[#111111]">
                  {lang.tips.map((tip, idx) => (
                    <li key={`${lang.code}-tip-${idx}`}>{tip}</li>
                  ))}
                </ul>
              </Section>

              {/* Support */}
              <Section className="mt-8 rounded-[16px] border border-[#E5E7EB] px-6 py-5 text-center">
                <Text className="m-0 text-[13px] leading-6 text-[#111111]">
                  {lang.supportIntro}{" "}
                  <Link
                    href={`mailto:${supportEmail}`}
                    className="text-[#111111] underline"
                  >
                    {supportEmail}
                  </Link>{" "}
                  {lang.supportOutro}{" "}
                  <Link
                    href={`tel:${supportPhone}`}
                    className="text-[#111111] underline"
                  >
                    {supportPhone}
                  </Link>
                  .
                </Text>
              </Section>
            </Section>

            <Hr className="my-8 border-t border-[#E5E7EB]" />

            {/* Footer */}
            <Section className="px-10 pb-10 text-center">
              <Text className="m-0 text-[12px] leading-5 text-[#6B7280]">
                {lang.footer}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export const abandonedCartEmail = (props: AbandonedCartEmailProps) => (
  <AbandonedCartEmail {...props} />
);

// @ts-ignore - consumed by React Email dev server
export default () => (
  <AbandonedCartEmail
    customerName="Partner"
    recoverUrl="https://teherguminet.hu/cart/recover/cart_123"
    currencyCode="HUF"
    storefrontUrl="https://teherguminet.hu"
    items={[
      {
        id: "item_1",
        title: "Michelin X Multi Z 315/80 R22.5",
        quantity: 4,
        unit_price: 215,
        thumbnail:
          "https://cdn11.bigcommerce.com/s-ykpvhku8bx/images/stencil/original/products/114/498/retread-tires.1__59244.1562264741.png",
      },
    ]}
  />
);
