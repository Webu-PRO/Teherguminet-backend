import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components"

type OrderAddress = {
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  country_code?: string | null
  [key: string]: unknown
} | null

type OrderItem = {
  id: string
  title?: string | null
  product_title?: string | null
  subtitle?: string | null
  quantity?: number | null
  total?: number | null
  unit_price?: number | null
  thumbnail?: string | null
  [key: string]: unknown
}

type OrderShippingMethod = {
  id: string
  name?: string | null
  amount?: number | null
  [key: string]: unknown
}

type OrderCustomer = {
  first_name?: string | null
  [key: string]: unknown
} | null

export type OrderPlacedEmailProps = {
  order: {
    id: string
    display_id?: number | string | null
    email?: string | null
    currency_code?: string | null
    total?: number | null
    subtotal?: number | null
    shipping_total?: number | null
    shipping_address?: OrderAddress
    billing_address?: OrderAddress
    items?: OrderItem[]
    shipping_methods?: OrderShippingMethod[]
    customer?: OrderCustomer
    [key: string]: unknown
  }
}

const styles = {
  body: {
    backgroundColor: "#f4f4f5",
    fontFamily: '"Helvetica Neue", Arial, sans-serif',
    margin: "0",
    padding: "40px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    margin: "0 auto",
    maxWidth: "600px",
    padding: "32px",
  },
  heading: {
    fontSize: "24px",
    margin: "0 0 16px",
    color: "#111827",
  },
  subheading: {
    fontSize: "16px",
    fontWeight: 600,
    margin: "0 0 12px",
    color: "#111827",
  },
  text: {
    fontSize: "14px",
    lineHeight: "20px",
    color: "#374151",
    margin: "0 0 12px",
  },
  muted: {
    fontSize: "12px",
    lineHeight: "18px",
    color: "#6b7280",
    margin: "4px 0",
  },
  section: {
    marginBottom: "24px",
  },
  itemRow: {
    backgroundColor: "#f9fafb",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "12px",
  },
  thumbnail: {
    borderRadius: "8px",
    objectFit: "cover" as const,
  },
  hr: {
    borderColor: "#e5e7eb",
    margin: "24px 0",
  },
  link: {
    color: "#2563eb",
    textDecoration: "none",
    fontSize: "14px",
  },
  footerText: {
    fontSize: "12px",
    lineHeight: "18px",
    color: "#6b7280",
    margin: "0 0 16px",
  },
}

const formatAddress = (
  address: OrderPlacedEmailProps["order"]["shipping_address"] | null | undefined
) => {
  if (!address) {
    return "—"
  }

  const name = [address.first_name, address.last_name]
    .filter(Boolean)
    .join(" ")
  const lines = [
    name,
    [address.address_1, address.address_2].filter(Boolean).join(", "),
    [address.postal_code, address.city].filter(Boolean).join(" "),
    address.province,
    address.country_code?.toUpperCase(),
  ]
    .filter(Boolean)
    .join("\n")

  return lines || "—"
}

const formatAmount = (value: number | null | undefined, currencyCode: string) => {
  if (typeof value !== "number") {
    return "—"
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currencyCode.toUpperCase()}`
  }
}

export const OrderPlacedEmailComponent = ({
  order,
}: OrderPlacedEmailProps) => {
  const currency = order.currency_code ?? "usd"
  const displayId = order.display_id ?? order.id
  const displayLabel =
    displayId === null || displayId === undefined
      ? order.id
      : typeof displayId === "number"
        ? displayId.toString()
        : displayId
  const customerName =
    order.customer?.first_name || order.shipping_address?.first_name || "there"
  const previewText = `Order #${displayLabel} confirmation`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>
            Thanks for your order, {customerName}!
          </Heading>
          <Text style={styles.text}>
            We&apos;re getting your order ready to be shipped. Here&apos;s a
            quick summary of what you purchased.
          </Text>

          <Section style={styles.section}>
            <Text style={styles.muted}>Order number</Text>
            <Text style={styles.text}>{displayLabel}</Text>
            <Text style={styles.muted}>Placed for</Text>
            <Text style={styles.text}>{order.email ?? "—"}</Text>
            <Text style={styles.muted}>Total</Text>
            <Text style={styles.text}>
              {formatAmount(order.total, currency)}
            </Text>
          </Section>

          {!!order.items?.length && (
            <Section style={styles.section}>
              <Heading style={styles.subheading}>Items</Heading>
              {order.items.map((item) => (
                <Section key={item.id} style={styles.itemRow}>
                  <Row>
                    {item.thumbnail ? (
                      <Column style={{ width: "80px" }}>
                        <Img
                          src={item.thumbnail}
                          alt={item.product_title ?? item.title ?? "Product"}
                          width="64"
                          height="64"
                          style={styles.thumbnail}
                        />
                      </Column>
                    ) : null}
                    <Column>
                      <Text style={styles.text}>
                        {item.product_title ?? item.title ?? "Item"}{" "}
                        {item.subtitle ? `— ${item.subtitle}` : ""}
                      </Text>
                      <Text style={styles.muted}>
                        Quantity: {item.quantity ?? 1}
                      </Text>
                      <Text style={styles.muted}>
                        Total: {formatAmount(item.total, currency)}
                      </Text>
                    </Column>
                  </Row>
                </Section>
              ))}
            </Section>
          )}

          {!!order.shipping_methods?.length && (
            <Section style={styles.section}>
              <Heading style={styles.subheading}>Shipping</Heading>
              {order.shipping_methods.map((method) => (
                <Text key={method.id} style={styles.text}>
                  {method.name ?? "Standard Shipping"} —{" "}
                  {formatAmount(method.amount, currency)}
                </Text>
              ))}
            </Section>
          )}

          <Section style={styles.section}>
            <Heading style={styles.subheading}>Shipping address</Heading>
            <Text style={{ ...styles.text, whiteSpace: "pre-line" }}>
              {formatAddress(order.shipping_address)}
            </Text>
          </Section>

          <Section style={styles.section}>
            <Heading style={styles.subheading}>Billing address</Heading>
            <Text style={{ ...styles.text, whiteSpace: "pre-line" }}>
              {formatAddress(order.billing_address)}
            </Text>
          </Section>

          <Hr style={styles.hr} />

          <Text style={styles.footerText}>
            We&apos;ll send you another email when your order ships. If you have
            any questions, just reply to this email—we&apos;re always happy to
            help.
          </Text>
          <Link href="https://therguminet.hu" style={styles.link}>
            Visit Teherguminet.hu
          </Link>
        </Container>
      </Body>
    </Html>
  )
}

export const mockOrder: OrderPlacedEmailProps = {
  order: {
    id: "order_01JSNXDH9BPJWWKVW03B9E9KW8",
    display_id: 1,
    email: "afsaf@gmail.com",
    currency_code: "eur",
    total: 20,
    subtotal: 20,
    discount_total: 0,
    shipping_total: 10,
    tax_total: 0,
    item_subtotal: 10,
    item_total: 10,
    item_tax_total: 0,
    customer_id: "cus_01JSNXD6VQC1YH56E4TGC81NWX",
    items: [
      {
        id: "ordli_01JSNXDH9C47KZ43WQ3TBFXZA9",
        title: "L",
        subtitle: "Medusa Sweatshirt",
        thumbnail:
          "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-front.png",
        variant_id: "variant_01JSNXAQCZ5X81A3NRSVFJ3ZHQ",
        product_id: "prod_01JSNXAQBQ6MFV5VHKN420NXQW",
        product_title: "Medusa Sweatshirt",
        product_description:
          "Reimagine the feeling of a classic sweatshirt. With our cotton sweatshirt, everyday essentials no longer have to be ordinary.",
        product_subtitle: null,
        product_type: null,
        product_type_id: null,
        product_collection: null,
        product_handle: "sweatshirt",
        variant_sku: "SWEATSHIRT-L",
        variant_barcode: null,
        variant_title: "L",
        variant_option_values: null,
        requires_shipping: true,
        is_giftcard: false,
        is_discountable: true,
        is_tax_inclusive: false,
        is_custom_price: false,
        metadata: {},
        raw_compare_at_unit_price: null,
        raw_unit_price: {
          value: "10",
          precision: 20,
        },
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        tax_lines: [],
        adjustments: [],
        compare_at_unit_price: null,
        unit_price: 10,
        quantity: 1,
        raw_quantity: {
          value: "1",
          precision: 20,
        },
        detail: {
          id: "orditem_01JSNXDH9DK1XMESEZPADYFWKY",
          version: 1,
          metadata: null,
          order_id: "order_01JSNXDH9BPJWWKVW03B9E9KW8",
          raw_unit_price: null,
          raw_compare_at_unit_price: null,
          raw_quantity: {
            value: "1",
            precision: 20,
          },
          raw_fulfilled_quantity: {
            value: "0",
            precision: 20,
          },
          raw_delivered_quantity: {
            value: "0",
            precision: 20,
          },
          raw_shipped_quantity: {
            value: "0",
            precision: 20,
          },
          raw_return_requested_quantity: {
            value: "0",
            precision: 20,
          },
          raw_return_received_quantity: {
            value: "0",
            precision: 20,
          },
          raw_return_dismissed_quantity: {
            value: "0",
            precision: 20,
          },
          raw_written_off_quantity: {
            value: "0",
            precision: 20,
          },
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          item_id: "ordli_01JSNXDH9C47KZ43WQ3TBFXZA9",
          unit_price: null,
          compare_at_unit_price: null,
          quantity: 1,
          fulfilled_quantity: 0,
          delivered_quantity: 0,
          shipped_quantity: 0,
          return_requested_quantity: 0,
          return_received_quantity: 0,
          return_dismissed_quantity: 0,
          written_off_quantity: 0,
        },
        subtotal: 10,
        total: 10,
        original_total: 10,
        discount_total: 0,
        discount_subtotal: 0,
        discount_tax_total: 0,
        tax_total: 0,
        original_tax_total: 0,
        refundable_total_per_unit: 10,
        refundable_total: 10,
        fulfilled_total: 0,
        shipped_total: 0,
        return_requested_total: 0,
        return_received_total: 0,
        return_dismissed_total: 0,
        write_off_total: 0,
        raw_subtotal: {
          value: "10",
          precision: 20,
        },
        raw_total: {
          value: "10",
          precision: 20,
        },
        raw_original_total: {
          value: "10",
          precision: 20,
        },
        raw_discount_total: {
          value: "0",
          precision: 20,
        },
        raw_discount_subtotal: {
          value: "0",
          precision: 20,
        },
        raw_discount_tax_total: {
          value: "0",
          precision: 20,
        },
        raw_tax_total: {
          value: "0",
          precision: 20,
        },
        raw_original_tax_total: {
          value: "0",
          precision: 20,
        },
        raw_refundable_total_per_unit: {
          value: "10",
          precision: 20,
        },
        raw_refundable_total: {
          value: "10",
          precision: 20,
        },
        raw_fulfilled_total: {
          value: "0",
          precision: 20,
        },
        raw_shipped_total: {
          value: "0",
          precision: 20,
        },
        raw_return_requested_total: {
          value: "0",
          precision: 20,
        },
        raw_return_received_total: {
          value: "0",
          precision: 20,
        },
        raw_return_dismissed_total: {
          value: "0",
          precision: 20,
        },
        raw_write_off_total: {
          value: "0",
          precision: 20,
        },
      },
    ],
    shipping_address: {
      id: "caaddr_01JSNXD6W0TGPH2JQD18K97B25",
      customer_id: null,
      company: "",
      first_name: "safasf",
      last_name: "asfaf",
      address_1: "asfasf",
      address_2: "",
      city: "asfasf",
      country_code: "dk",
      province: "",
      postal_code: "asfasf",
      phone: "",
      metadata: null,
      created_at: "2025-04-25T07:25:48.801Z",
      updated_at: "2025-04-25T07:25:48.801Z",
      deleted_at: null,
    },
    billing_address: {
      id: "caaddr_01JSNXD6W0V7RNZH63CPG26K5W",
      customer_id: null,
      company: "",
      first_name: "safasf",
      last_name: "asfaf",
      address_1: "asfasf",
      address_2: "",
      city: "asfasf",
      country_code: "dk",
      province: "",
      postal_code: "asfasf",
      phone: "",
      metadata: null,
      created_at: "2025-04-25T07:25:48.801Z",
      updated_at: "2025-04-25T07:25:48.801Z",
      deleted_at: null,
    },
    shipping_methods: [
      {
        id: "ordsm_01JSNXDH9B9DDRQXJT5J5AE5V1",
        name: "Standard Shipping",
        description: null,
        is_tax_inclusive: false,
        is_custom_amount: false,
        shipping_option_id: "so_01JSNXAQA64APG6BNHGCMCTN6V",
        data: {},
        metadata: null,
        raw_amount: {
          value: "10",
          precision: 20,
        },
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        tax_lines: [],
        adjustments: [],
        amount: 10,
        order_id: "order_01JSNXDH9BPJWWKVW03B9E9KW8",
        detail: {
          id: "ordspmv_01JSNXDH9B5RAF4FH3M1HH3TEA",
          version: 1,
          order_id: "order_01JSNXDH9BPJWWKVW03B9E9KW8",
          return_id: null,
          exchange_id: null,
          claim_id: null,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          shipping_method_id: "ordsm_01JSNXDH9B9DDRQXJT5J5AE5V1",
        },
        subtotal: 10,
        total: 10,
        original_total: 10,
        discount_total: 0,
        discount_subtotal: 0,
        discount_tax_total: 0,
        tax_total: 0,
        original_tax_total: 0,
        raw_subtotal: {
          value: "10",
          precision: 20,
        },
        raw_total: {
          value: "10",
          precision: 20,
        },
        raw_original_total: {
          value: "10",
          precision: 20,
        },
        raw_discount_total: {
          value: "0",
          precision: 20,
        },
        raw_discount_subtotal: {
          value: "0",
          precision: 20,
        },
        raw_discount_tax_total: {
          value: "0",
          precision: 20,
        },
        raw_tax_total: {
          value: "0",
          precision: 20,
        },
        raw_original_tax_total: {
          value: "0",
          precision: 20,
        },
      },
    ],
    customer: {
      id: "cus_01JSNXD6VQC1YH56E4TGC81NWX",
      company_name: null,
      first_name: null,
      last_name: null,
      email: "afsaf@gmail.com",
      phone: null,
      has_account: false,
      metadata: null,
      created_by: null,
      created_at: "2025-04-25T07:25:48.791Z",
      updated_at: "2025-04-25T07:25:48.791Z",
      deleted_at: null,
    },
  },
}

// @ts-ignore - used by the React Email dev server
export default () => <OrderPlacedEmailComponent {...mockOrder} />
