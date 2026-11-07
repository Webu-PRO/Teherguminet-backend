import { isSensitiveMetadataKey, stripSensitiveMetadata } from "../strip-supplier-cost"

describe("stripSensitiveMetadata", () => {
  it("removes supplier cost, shipping fee and internal id from nested variant metadata", () => {
    const body = {
      products: [
        {
          id: "prod_1",
          metadata: { seo_title: "Gumi", tomket_cost_eur_net: 12.5 },
          variants: [
            {
              id: "var_1",
              metadata: {
                tomket_cost_eur_net: 41.2,
                tomket_shipping_eur_net: 3.1,
                tomket_internal_id: "123",
                tomket_ean: "5901234123457",
                tomket_size: "315/80 R22.5",
                tomket_label_wet_grip: "B",
              },
            },
          ],
        },
      ],
      count: 1,
    }

    stripSensitiveMetadata(body)

    expect(body.products[0].metadata).toEqual({ seo_title: "Gumi" })
    expect(body.products[0].variants[0].metadata).toEqual({
      tomket_ean: "5901234123457",
      tomket_size: "315/80 R22.5",
      tomket_label_wet_grip: "B",
    })
    expect(body.count).toBe(1)
  })

  it("leaves non-metadata fields named like cost untouched", () => {
    const body = { cart: { shipping_total: 990, items: [{ unit_price: 100, metadata: { purchase_ref: "x", gift: true } }] } }
    stripSensitiveMetadata(body)
    expect(body.cart.shipping_total).toBe(990)
    expect(body.cart.items[0].unit_price).toBe(100)
    expect(body.cart.items[0].metadata).toEqual({ gift: true })
  })

  it("handles null, primitives and cycles", () => {
    expect(stripSensitiveMetadata(null)).toBeNull()
    expect(stripSensitiveMetadata("x")).toBe("x")
    const a: Record<string, unknown> = { metadata: { cost_price: 1, ok: 2 } }
    a.self = a
    stripSensitiveMetadata(a)
    expect(a.metadata).toEqual({ ok: 2 })
  })

  it("classifies keys", () => {
    for (const k of ["tomket_cost_eur_net", "cost_price", "purchase_price", "beszerzesi_ar", "tomket_shipping_eur_net", "tomket_internal_id", "internal_id", "supplier_id", "tomket_supplier_id", "margin_pct"]) {
      expect(isSensitiveMetadataKey(k)).toBe(true)
    }
    for (const k of ["tomket_ean", "tomket_dot", "tomket_label_noise_class", "seo_title", "min_qty"]) {
      expect(isSensitiveMetadataKey(k)).toBe(false)
    }
  })
})
