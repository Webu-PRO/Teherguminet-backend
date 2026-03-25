import * as React from "react";
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
import { LanguageCode, resolveLanguageFromOrder } from "../email-language";
import {
  CONTACT_EMAIL,
  CONTACT_PHONE,
  F1_RED,
  LANGUAGE_THEMES,
  buildOrderUrl,
  resolveCustomerName,
  resolveOrderId,
  type LanguageTheme,
  type OrderEmailOrder,
} from "./order-email-shared";

type CancelledItem = {
  id?: string | null;
  name?: string | null;
  quantity?: number | null;
  sku?: string | null;
  variant_title?: string | null;
  thumbnail?: string | null;
};

export type OrderItemsCancelledEmailProps = {
  order: OrderEmailOrder;
  cancelled_items?: CancelledItem[] | null;

  /**
   * Optional: allow caller to pass a pre-built URL (recommended).
   * If not passed, we fall back to buildOrderUrl(order.id, language).
   */
  order_url?: string | null;

  /**
   * Optional brand overrides for re-use/white-labeling.
   */
  brand?: {
    name?: string;
    domain?: string;
    websiteUrl?: string;
    logoUrl?: string;
    logoAlt?: string;
  };

  /**
   * Optional: expose template version for safe rollouts.
   */
  template_version?: string | null;
};

const FONT_STACK =
  '"SF Pro Text","SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

type LanguageBlock = {
  code: LanguageCode;
  locale: string;
  preview: (orderId: string) => string;
  heading: string;
  badge: string;
  intro: (name: string, orderId: string) => React.ReactNode;
  body: string;
  listTitle: string;
  noItemsCopy: string;
  ctaLabel: string;
  secondaryCtaLabel: string;
  contactTitle: string;
  contactCopy: React.ReactNode;
  closingLines: string[];
  footer: string;
  theme: LanguageTheme;
};

const BRAND_DEFAULT = {
  name: "TEHERGUMINET",
  domain: "Teherguminet.hu",
  websiteUrl: "https://teherguminet.hu",
  logoUrl: "https://teherguminet.hu/assets/email/teherguminet-mark.png",
  logoAlt: "Teherguminet",
};

const TOKENS = {
  radius: { outer: 24, inner: 16, pill: 999 },
  border: { light: "1px solid #E5E7EB", dark: "1px solid #2A2F3A" },
  shadow: {
    light: "0 16px 40px rgba(17,17,17,0.08)",
    dark: "0 16px 40px rgba(0,0,0,0.35)",
  },
  color: {
    bg: "#ffffff",
    text: "#111111",
    muted: "#6B7280",
    subtle: "#F9FAFB",
    subtle2: "#F3F4F6",
    border: "#E5E7EB",
    brand: F1_RED,
    brandSoft: "rgba(225, 6, 0, 0.10)",
    danger: "#EF4444",
    dangerSoft: "rgba(239, 68, 68, 0.10)",
    link: "#111111",
    darkBg: "#0B0F19",
    darkCard: "#0F1629",
    darkText: "#E5E7EB",
    darkMuted: "#A1A1AA",
    darkSubtle: "#111827",
    darkBorder: "#2A2F3A",
    darkLink: "#E5E7EB",
  },
  space: { pageY: 36, pageX: 20, pad: 28, padSm: 18, gap: 16, micro: 10 },
  type: { brand: 14, title: 24, body: 15, small: 12, micro: 11 },
};

type Css = React.CSSProperties;

const styles = {
  body: {
    backgroundColor: TOKENS.color.bg,
    margin: 0,
    padding: `${TOKENS.space.pageY}px 0`,
    fontFamily: FONT_STACK,
    color: TOKENS.color.text,
  } as Css,
  container: {
    width: "100%",
    maxWidth: "680px",
    margin: "0 auto",
    padding: `0 ${TOKENS.space.pageX}px`,
  } as Css,
  card: {
    borderRadius: `${TOKENS.radius.outer}px`,
    backgroundColor: TOKENS.color.bg,
    border: TOKENS.border.light,
    boxShadow: TOKENS.shadow.light,
    overflow: "hidden",
  } as Css,
  header: {
    padding: `${TOKENS.space.pad}px ${TOKENS.space.pad}px 14px`,
    backgroundColor: TOKENS.color.brand,
  } as Css,
  headerTopRow: {
    width: "100%",
  } as Css,
  brandWrap: {
    display: "inline-block",
    textDecoration: "none",
  } as Css,
  brandText: {
    fontSize: `${TOKENS.type.brand}px`,
    fontWeight: 800,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    margin: 0,
    color: "#ffffff",
    textDecoration: "none",
    display: "inline-block",
    fontFamily: FONT_STACK,
  } as Css,
  logo: {
    display: "inline-block",
    verticalAlign: "middle",
    borderRadius: 10,
  } as Css,
  title: {
    margin: "14px 0 10px",
    fontSize: `${TOKENS.type.title}px`,
    lineHeight: "1.2",
    fontWeight: 900,
    color: "#ffffff",
    fontFamily: FONT_STACK,
  } as Css,
  p: {
    fontSize: `${TOKENS.type.body}px`,
    lineHeight: "22px",
    margin: "0 0 12px",
    color: "#FEE2E2",
    fontFamily: FONT_STACK,
  } as Css,
  muted: {
    fontSize: `${TOKENS.type.small}px`,
    lineHeight: "18px",
    color: TOKENS.color.muted,
    margin: 0,
    fontFamily: FONT_STACK,
  } as Css,
  divider: {
    borderTop: TOKENS.border.light,
    margin: 0,
  } as Css,
  badge: {
    display: "inline-block",
    borderRadius: `${TOKENS.radius.pill}px`,
    padding: "7px 12px",
    fontSize: `${TOKENS.type.micro}px`,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    fontWeight: 800,
    margin: "0 0 12px",
    border: `1px solid rgba(239, 68, 68, 0.35)`,
    backgroundColor: TOKENS.color.dangerSoft,
    color: TOKENS.color.danger,
    fontFamily: FONT_STACK,
  } as Css,
  content: {
    padding: `16px ${TOKENS.space.pad}px ${TOKENS.space.pad}px`,
  } as Css,
  listCard: {
    marginTop: "6px",
    padding: "16px",
    borderRadius: `${TOKENS.radius.inner}px`,
    backgroundColor: TOKENS.color.subtle,
    border: TOKENS.border.light,
  } as Css,
  listTitle: {
    fontSize: `${TOKENS.type.micro}px`,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    fontWeight: 900,
    margin: "0 0 12px",
    color: TOKENS.color.text,
    fontFamily: FONT_STACK,
  } as Css,
  itemRow: {
    padding: "12px 0",
    borderBottom: "1px solid rgba(15,23,42,0.08)",
  } as Css,
  itemName: {
    fontSize: "14px",
    fontWeight: 800,
    margin: "0 0 4px",
    color: TOKENS.color.text,
    fontFamily: FONT_STACK,
  } as Css,
  itemMeta: {
    fontSize: "12px",
    margin: 0,
    color: TOKENS.color.muted,
    fontFamily: FONT_STACK,
  } as Css,
  thumb: {
    borderRadius: 12,
    border: TOKENS.border.light,
    backgroundColor: "#fff",
  } as Css,
  qtyPill: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: `${TOKENS.radius.pill}px`,
    border: TOKENS.border.light,
    backgroundColor: "#ffffff",
    fontSize: "12px",
    fontWeight: 900,
    color: TOKENS.color.text,
    fontFamily: FONT_STACK,
  } as Css,
  ctaRow: {
    marginTop: TOKENS.space.gap,
  } as Css,
  ctaPrimary: {
    backgroundColor: TOKENS.color.brand,
    borderRadius: `${TOKENS.radius.pill}px`,
    padding: "12px 18px",
    fontSize: "14px",
    fontWeight: 900,
    color: "#ffffff",
    textDecoration: "none",
    display: "inline-block",
    fontFamily: FONT_STACK,
  } as Css,
  ctaSecondary: {
    backgroundColor: TOKENS.color.subtle2,
    borderRadius: `${TOKENS.radius.pill}px`,
    padding: "12px 18px",
    fontSize: "14px",
    fontWeight: 900,
    color: TOKENS.color.text,
    textDecoration: "none",
    display: "inline-block",
    fontFamily: FONT_STACK,
    border: TOKENS.border.light,
  } as Css,
  link: {
    color: TOKENS.color.link,
    textDecoration: "underline",
    fontFamily: FONT_STACK,
    wordBreak: "break-word",
  } as Css,
  contactCard: {
    marginTop: TOKENS.space.gap,
    borderRadius: `${TOKENS.radius.inner}px`,
    border: TOKENS.border.light,
    backgroundColor: TOKENS.color.bg,
    padding: "16px",
  } as Css,
  contactTitle: {
    margin: 0,
    fontSize: "14px",
    fontWeight: 900,
    color: TOKENS.color.text,
    fontFamily: FONT_STACK,
  } as Css,
  footer: {
    textAlign: "center",
    fontSize: `${TOKENS.type.small}px`,
    lineHeight: "18px",
    color: TOKENS.color.muted,
    margin: "16px 0 0",
    fontFamily: FONT_STACK,
  } as Css,
  fineprint: {
    textAlign: "center",
    fontSize: "11px",
    lineHeight: "16px",
    color: TOKENS.color.muted,
    margin: "10px 0 0",
    fontFamily: FONT_STACK,
  } as Css,
};

const safeTrim = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const getItems = (items?: CancelledItem[] | null) =>
  Array.isArray(items)
    ? items
        .map((item, index) => {
          const name =
            safeTrim(item?.name) ||
            safeTrim(item?.variant_title) ||
            `Item ${index + 1}`;
          const quantity =
            typeof item?.quantity === "number" && item.quantity > 0
              ? item.quantity
              : 1;
          const sku = safeTrim(item?.sku) || null;
          const thumb = safeTrim(item?.thumbnail) || null;

          const key = safeTrim(item?.id) || `${name}-${index}`;

          return { key, name, quantity, sku, thumbnail: thumb };
        })
        .filter(Boolean)
    : [];

const resolveBrand = (brand?: OrderItemsCancelledEmailProps["brand"]) => ({
  name: brand?.name ?? BRAND_DEFAULT.name,
  domain: brand?.domain ?? BRAND_DEFAULT.domain,
  websiteUrl: brand?.websiteUrl ?? BRAND_DEFAULT.websiteUrl,
  logoUrl: brand?.logoUrl ?? BRAND_DEFAULT.logoUrl,
  logoAlt: brand?.logoAlt ?? BRAND_DEFAULT.logoAlt,
});

const buildBlocks = (): Record<LanguageCode, LanguageBlock> => ({
  hu: {
    code: "hu",
    locale: "hu-HU",
    preview: (id) => `Tételek törölve a rendelésből: ${id}`,
    heading: "Tételek törölve",
    badge: "Rendelés frissítve",
    intro: (name, id) => (
      <>
        Szia {name}, az alábbi tételeket töröltük a {id} rendelésből.
      </>
    ),
    body: "A rendelésed összértéke és elérhetősége ettől változhat. Ha a törlés hibásnak tűnik, jelezd nekünk, és gyorsan egyeztetünk.",
    listTitle: "Törölt tételek",
    noItemsCopy:
      "A rendelésed módosult, de a törölt tételek listája nem elérhető.",
    ctaLabel: "Rendelés megtekintése",
    secondaryCtaLabel: "Ügyfélszolgálat",
    contactTitle: "Kapcsolat",
    contactCopy: (
      <>
        Írj a{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
          {CONTACT_EMAIL}
        </Link>{" "}
        címre vagy hívd a {CONTACT_PHONE} számot.
      </>
    ),
    closingLines: ["Köszönjük a türelmed!", "Üdv,", "Teherguminet.hu"],
    footer: "Automatikus értesítés a rendelés módosításáról.",
    theme: LANGUAGE_THEMES.hu,
  },
  sk: {
    code: "sk",
    locale: "sk-SK",
    preview: (id) => `Zrušené položky z objednávky: ${id}`,
    heading: "Zrušené položky",
    badge: "Objednávka aktualizovaná",
    intro: (name, id) => (
      <>
        Ahoj {name}, nasledovné položky sme zrušili z objednávky {id}.
      </>
    ),
    body: "Celková hodnota objednávky a dostupnosť sa tým môže zmeniť. Ak to vyzerá nesprávne, daj nám vedieť a rýchlo to zosúladíme.",
    listTitle: "Zrušené položky",
    noItemsCopy:
      "Objednávka bola upravená, ale zoznam zrušených položiek nie je dostupný.",
    ctaLabel: "Zobraziť objednávku",
    secondaryCtaLabel: "Podpora",
    contactTitle: "Kontakt",
    contactCopy: (
      <>
        Napíš na{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
          {CONTACT_EMAIL}
        </Link>{" "}
        alebo zavolaj na {CONTACT_PHONE}.
      </>
    ),
    closingLines: [
      "Ďakujeme za pochopenie!",
      "S pozdravom,",
      "Teherguminet.hu",
    ],
    footer: "Automatické upozornenie o zmene objednávky.",
    theme: LANGUAGE_THEMES.sk,
  },
});

export const OrderItemsCancelledEmail = ({
  order,
  cancelled_items,
  order_url,
  brand,
  template_version,
}: OrderItemsCancelledEmailProps) => {
  const orderId = resolveOrderId(order);
  const customerName = resolveCustomerName(order);
  const language = resolveLanguageFromOrder(order);
  const orderUrl = order_url?.trim() || buildOrderUrl(order.id, language);
  const items = getItems(cancelled_items);
  const blocks = buildBlocks();
  const block = blocks[language] ?? blocks.hu;
  const b = resolveBrand(brand);

  const telHref = `tel:${String(CONTACT_PHONE).replace(/\s+/g, "")}`;
  const supportHref = `mailto:${CONTACT_EMAIL}`;

  return (
    <Html lang={block.locale}>
      <Head>
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: ${TOKENS.color.darkBg} !important; }
            .card { background: ${TOKENS.color.darkCard} !important; border: ${TOKENS.border.dark} !important; box-shadow: ${TOKENS.shadow.dark} !important; }
            .text { color: ${TOKENS.color.darkText} !important; }
            .muted { color: ${TOKENS.color.darkMuted} !important; }
            .subtle { background: ${TOKENS.color.darkSubtle} !important; border: ${TOKENS.border.dark} !important; }
            a { color: ${TOKENS.color.darkLink} !important; }
            .secondary { background: rgba(255,255,255,0.06) !important; border: ${TOKENS.border.dark} !important; color: ${TOKENS.color.darkText} !important; }
            .thumb { border: ${TOKENS.border.dark} !important; background: rgba(255,255,255,0.06) !important; }
            .qty { border: ${TOKENS.border.dark} !important; background: rgba(255,255,255,0.06) !important; color: ${TOKENS.color.darkText} !important; }
          }
          @media (max-width: 520px) {
            .container { padding: 0 14px !important; }
            .header { padding: ${TOKENS.space.padSm}px ${TOKENS.space.padSm}px 12px !important; }
            .content { padding: 14px ${TOKENS.space.padSm}px ${TOKENS.space.padSm}px !important; }
            .title { font-size: 22px !important; }
          }
        `}</style>
      </Head>

      <Preview>{block.preview(orderId)}</Preview>

      <Body style={styles.body}>
        <Container style={styles.container} className="container">
          <Section style={styles.card} className="card">
            <Section style={styles.header} className="header">
              <Section style={styles.headerTopRow}>
                <table
                  role="presentation"
                  style={{ width: "100%", borderCollapse: "collapse" }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{
                          width: "70%",
                          verticalAlign: "middle",
                        }}
                      >
                        <Link href={b.websiteUrl} style={styles.brandWrap}>
                          <table
                            role="presentation"
                            style={{ borderCollapse: "collapse" }}
                          >
                            <tbody>
                              <tr>
                                <td
                                  style={{
                                    width: "40px",
                                    verticalAlign: "middle",
                                  }}
                                >
                                  <img
                                    src={b.logoUrl}
                                    alt={b.logoAlt}
                                    width="32"
                                    height="32"
                                    style={styles.logo}
                                  />
                                </td>
                                <td style={{ verticalAlign: "middle" }}>
                                  <Text
                                    style={styles.brandText}
                                    className="text"
                                  >
                                    {b.name}
                                  </Text>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </Link>
                      </td>
                      <td
                        style={{
                          width: "30%",
                          textAlign: "right",
                          verticalAlign: "middle",
                        }}
                      >
                        <Text style={styles.badge}>{block.badge}</Text>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>

              <Heading style={styles.title} className="title text">
                {block.heading}
              </Heading>

              <Text style={styles.p} className="text">
                {block.intro(customerName, orderId)}
              </Text>

              <Text style={styles.p} className="text">
                {block.body}
              </Text>

              {template_version ? (
                <Text
                  style={{ ...styles.muted, marginTop: "8px" }}
                  className="muted"
                >
                  Template v{template_version}
                </Text>
              ) : null}
            </Section>

            <Hr style={{ ...styles.divider, borderTop: "none" }} />

            <Section style={styles.content} className="content">
              <Section style={styles.listCard} className="subtle">
                <Text style={styles.listTitle} className="text">
                  {block.listTitle}
                </Text>

                {items.length ? (
                  items.map((item, index) => {
                    const isLast = index === items.length - 1;
                    return (
                      <Section
                        key={item.key}
                        style={{
                          ...styles.itemRow,
                          borderBottom: isLast
                            ? "none"
                            : styles.itemRow.borderBottom,
                        }}
                      >
                        <table
                          role="presentation"
                          style={{ width: "100%", borderCollapse: "collapse" }}
                        >
                          <tbody>
                            <tr>
                              <td
                                style={{
                                  width: "56px",
                                  verticalAlign: "top",
                                }}
                              >
                                {item.thumbnail ? (
                                  <img
                                    src={item.thumbnail}
                                    alt={item.name}
                                    width="48"
                                    height="48"
                                    style={styles.thumb}
                                    className="thumb"
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: "48px",
                                      height: "48px",
                                      borderRadius: "12px",
                                      border: styles.thumb.border,
                                      backgroundColor: TOKENS.color.subtle2,
                                    }}
                                    className="thumb"
                                  />
                                )}
                              </td>

                              <td style={{ verticalAlign: "top" }}>
                                <Text
                                  style={styles.itemName}
                                  className="text"
                                >
                                  {item.name}
                                </Text>

                                <Text
                                  style={styles.itemMeta}
                                  className="muted"
                                >
                                  {item.sku ? `SKU: ${item.sku}` : " "}
                                </Text>
                              </td>

                              <td
                                style={{
                                  width: "86px",
                                  textAlign: "right",
                                  verticalAlign: "top",
                                }}
                              >
                                <Text style={styles.qtyPill} className="qty">
                                  × {item.quantity}
                                </Text>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </Section>
                    );
                  })
                ) : (
                  <Text style={styles.muted} className="muted">
                    {block.noItemsCopy}
                  </Text>
                )}
              </Section>

              <Section style={styles.ctaRow}>
                <table
                  role="presentation"
                  style={{ width: "100%", borderCollapse: "collapse" }}
                >
                  <tbody>
                    <tr>
                      <td style={{ width: "52%", verticalAlign: "middle" }}>
                        <Button href={orderUrl} style={styles.ctaPrimary}>
                          {block.ctaLabel}
                        </Button>
                      </td>
                      <td
                        style={{
                          width: "48%",
                          textAlign: "right",
                          verticalAlign: "middle",
                        }}
                      >
                        <Button
                          href={supportHref}
                          style={styles.ctaSecondary}
                          className="secondary"
                        >
                          {block.secondaryCtaLabel}
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <Text
                  style={{ ...styles.muted, marginTop: "10px" }}
                  className="muted"
                >
                  {block.contactTitle}:{" "}
                  <Link href={`mailto:${CONTACT_EMAIL}`} style={styles.link}>
                    {CONTACT_EMAIL}
                  </Link>
                  {" • "}
                  <Link href={telHref} style={styles.link}>
                    {CONTACT_PHONE}
                  </Link>
                </Text>
              </Section>

              <Section style={styles.contactCard}>
                <Text style={styles.contactTitle} className="text">
                  {block.contactTitle}
                </Text>
                <Text
                  style={{ ...styles.muted, marginTop: "8px" }}
                  className="muted"
                >
                  {block.contactCopy}
                </Text>
              </Section>

              {block.closingLines.map((line) => (
                <Text
                  key={line}
                  style={{ ...styles.muted, marginTop: "10px" }}
                  className="muted"
                >
                  {line}
                </Text>
              ))}
            </Section>
          </Section>

          <Text style={styles.footer} className="muted">
            {block.footer}
          </Text>
          <Text style={styles.fineprint} className="muted">
            {b.domain}
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const mockOrderItemsCancelled: OrderItemsCancelledEmailProps = {
  order: {
    id: "order_mock_1",
    display_id: 42,
    currency_code: "HUF",
    email: "customer@example.com",
    customer: { first_name: "Istvan" },
    shipping_address: {
      first_name: "Istvan",
      last_name: "Teszt",
      country_code: "hu",
    },
  },
  cancelled_items: [
    {
      name: "Continental Conti Hybrid HS3 315/70 R22.5",
      sku: "CONTI-HS3-315-70R22.5",
      quantity: 2,
    },
  ],
  template_version: "v2",
};

export default () => <OrderItemsCancelledEmail {...mockOrderItemsCancelled} />;
