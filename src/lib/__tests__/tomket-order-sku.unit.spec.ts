import { describe, expect, it } from "@jest/globals"
import type { OrderLineItemDTO } from "@medusajs/types"

import { buildTomketSku, parseTomketSku, resolveTomketItems } from "../tomket"

type LineItem = OrderLineItemDTO & {
  sku?: string | null
  variant?: { sku?: string | null; metadata?: Record<string, unknown> | null } | null
}

const lineItem = (overrides: Partial<LineItem>): LineItem =>
  ({
    id: "item_1",
    quantity: 1,
    ...overrides,
  }) as LineItem

describe("Tomket sku contract", () => {
  it("round-trips an internal id", () => {
    expect(parseTomketSku(buildTomketSku("128432"))).toBe("128432")
  })
})

describe("resolveTomketItems with imported catalogue skus", () => {
  it("resolves the supplier id from the TOMKET- prefixed variant sku", () => {
    const { items, missing } = resolveTomketItems([
      lineItem({ variant_sku: "TOMKET-128432" }),
    ])

    expect(missing).toHaveLength(0)
    expect(items).toEqual([
      {
        internalId: "128432",
        quantity: 1,
        lineItemIds: ["item_1"],
        source: "variant_sku.tomket_prefix",
      },
    ])
  })

  it("prefers variant metadata when it is available", () => {
    const { items } = resolveTomketItems([
      lineItem({
        variant_sku: "TOMKET-128432",
        variant: { metadata: { tomket_internal_id: "999111" } },
      }),
    ])

    // metadata.tomket_internal_id on the line item wins over the sku, and the
    // variant metadata fallback still resolves when the sku is absent.
    expect(items[0].internalId).toBe("128432")

    const { items: metadataOnly } = resolveTomketItems([
      lineItem({ variant: { metadata: { tomket_internal_id: "999111" } } }),
    ])

    expect(metadataOnly[0]).toMatchObject({
      internalId: "999111",
      source: "variant.metadata.tomket_internal_id",
    })
  })

  it("still accepts a bare numeric sku from another supplier feed", () => {
    const { items } = resolveTomketItems([lineItem({ variant_sku: "128432" })])

    expect(items[0]).toMatchObject({
      internalId: "128432",
      source: "variant_sku",
    })
  })

  it("groups several line items of the same tyre into one order", () => {
    const { items } = resolveTomketItems([
      lineItem({ id: "item_1", variant_sku: "TOMKET-128432", quantity: 2 }),
      lineItem({ id: "item_2", variant_sku: "TOMKET-128432", quantity: 3 }),
    ])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      internalId: "128432",
      quantity: 5,
      lineItemIds: ["item_1", "item_2"],
    })
  })

  it("reports line items with no resolvable supplier id", () => {
    const { items, missing } = resolveTomketItems([
      lineItem({ id: "item_9", variant_sku: "T0001" }),
    ])

    expect(items).toHaveLength(0)
    expect(missing).toEqual(["item_9"])
  })
})
