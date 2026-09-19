import {
  isOrderPaid,
  planTomketForward,
  type ForwardableOrder,
} from "../tomket-auto-forward"
import {
  EMPTY_TOMKET_SETTINGS,
  parseTomketSettingsInput,
  resolveTomketSettings,
} from "../tomket-settings"

const tomketItem = (id: string, quantity: number, internalId: string) =>
  ({
    id,
    quantity,
    variant_sku: `TOMKET-${internalId}`,
    variant: { sku: `TOMKET-${internalId}`, metadata: { tomket_internal_id: internalId } },
    metadata: {},
  }) as unknown as NonNullable<ForwardableOrder["items"]>[number]

const ownItem = (id: string, quantity: number) =>
  ({ id, quantity, variant_sku: "T0049", variant: { sku: "T0049" }, metadata: {} }) as unknown as NonNullable<
    ForwardableOrder["items"]
  >[number]

const paid: ForwardableOrder["payment_collections"] = [
  { status: "completed", payments: [{ captured_at: "2026-09-19T12:00:00Z" }] },
]

describe("planTomketForward", () => {
  it("skips orders without Tomket items", () => {
    expect(planTomketForward({ id: "o1", items: [ownItem("li1", 2)], payment_collections: paid })).toEqual({
      action: "skip",
      reason: "nincs Tomket tétel",
    })
  })

  it("waits for a captured payment", () => {
    expect(
      planTomketForward({
        id: "o1",
        items: [tomketItem("li1", 2, "35273")],
        payment_collections: [{ status: "awaiting", payments: [{ captured_at: null }] }],
      })
    ).toEqual({ action: "skip", reason: "még nincs befizetés" })
    expect(
      isOrderPaid({ id: "o1", payment_collections: [{ payments: [{ captured_at: "x", canceled_at: "y" }] }] })
    ).toBe(false)
  })

  it("fulfils only the Tomket lines of a mixed, paid order", () => {
    const plan = planTomketForward({
      id: "o1",
      items: [tomketItem("li1", 2, "35273"), ownItem("li2", 1), tomketItem("li3", 4, "49050")],
      payment_collections: paid,
    })
    expect(plan).toEqual({
      action: "fulfill",
      items: [
        { id: "li1", quantity: 2 },
        { id: "li3", quantity: 4 },
      ],
      internalIds: ["35273", "49050"],
    })
  })

  it("never re-sends quantities already covered by a live fulfillment", () => {
    const plan = planTomketForward({
      id: "o1",
      items: [tomketItem("li1", 4, "35273"), tomketItem("li3", 1, "49050")],
      payment_collections: paid,
      fulfillments: [
        { id: "f1", items: [{ line_item_id: "li1", quantity: 4 }] },
        { id: "f2", canceled_at: "2026-09-19", items: [{ line_item_id: "li3", quantity: 1 }] },
      ],
    })
    expect(plan).toEqual({
      action: "fulfill",
      items: [{ id: "li3", quantity: 1 }],
      internalIds: ["35273", "49050"],
    })
    expect(
      planTomketForward({
        id: "o1",
        items: [tomketItem("li1", 1, "35273")],
        payment_collections: paid,
        fulfillments: [{ id: "f1", items: [{ line_item_id: "li1", quantity: 1 }] }],
      })
    ).toEqual({ action: "skip", reason: "minden Tomket tétel már teljesítés alatt" })
  })

  it("skips cancelled orders", () => {
    expect(
      planTomketForward({ id: "o1", status: "canceled", items: [tomketItem("li1", 1, "1")], payment_collections: paid })
    ).toEqual({ action: "skip", reason: "a rendelés törölve" })
  })
})

describe("auto-forward setting", () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
  })

  it("defaults to on, honours env and admin overrides", () => {
    delete process.env.TOMKET_AUTO_FORWARD
    expect(resolveTomketSettings(EMPTY_TOMKET_SETTINGS).autoForwardPaidOrders).toEqual({ value: true, source: "default" })
    process.env.TOMKET_AUTO_FORWARD = "false"
    expect(resolveTomketSettings(EMPTY_TOMKET_SETTINGS).autoForwardPaidOrders).toEqual({ value: false, source: "env" })
    expect(
      resolveTomketSettings({ ...EMPTY_TOMKET_SETTINGS, autoForwardPaidOrders: true }).autoForwardPaidOrders
    ).toEqual({ value: true, source: "admin" })
    expect(parseTomketSettingsInput({ autoForwardPaidOrders: "0" }).autoForwardPaidOrders).toBe(false)
  })
})
