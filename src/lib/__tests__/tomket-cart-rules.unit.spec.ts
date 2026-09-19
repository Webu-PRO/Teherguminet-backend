import {
  filterShippingOptionsForTomket,
  isTomketCartItem,
} from "../tomket-cart-rules"
import { EMPTY_TOMKET_SETTINGS, resolveTomketSettings } from "../tomket-settings"

const tomket = { id: "so_t", name: "Tomket szállítás", provider_id: "tomket_tomket" }
const normal = { id: "so_n", name: "Normál szállítás", provider_id: "manual_teherguminet" }
const pickup = { id: "so_p", name: "Helyszíni átvétel", provider_id: "manual_manual" }

describe("isTomketCartItem", () => {
  it("recognises a Tomket line by SKU prefix or variant metadata", () => {
    expect(isTomketCartItem({ variant_sku: "TOMKET-35273" })).toBe(true)
    expect(isTomketCartItem({ variant: { sku: "TOMKET-49050" } })).toBe(true)
    expect(isTomketCartItem({ variant: { metadata: { tomket_internal_id: "1" } } })).toBe(true)
    expect(isTomketCartItem({ variant_sku: "T0049" })).toBe(false)
    expect(isTomketCartItem(null)).toBe(false)
  })
})

describe("filterShippingOptionsForTomket", () => {
  it("offers only the Tomket option when the cart has a Tomket tyre", () => {
    expect(filterShippingOptionsForTomket([normal, tomket, pickup], true)).toEqual([tomket])
  })
  it("hides the Tomket option otherwise", () => {
    expect(filterShippingOptionsForTomket([normal, tomket, pickup], false)).toEqual([normal, pickup])
  })
})

describe("shipping price settings", () => {
  it("default to 0 and honour the admin value", () => {
    const env = { ...process.env }
    delete process.env.TOMKET_SHIPPING_PRICE_HUF
    expect(resolveTomketSettings(EMPTY_TOMKET_SETTINGS).shippingPriceHuf).toEqual({ value: 0, source: "default" })
    expect(
      resolveTomketSettings({ ...EMPTY_TOMKET_SETTINGS, shippingPriceHuf: 2990 }).shippingPriceHuf
    ).toEqual({ value: 2990, source: "admin" })
    process.env = env
  })
})

describe("checkout option recognition and precedence", () => {
  it("recognises the Tomket option by provider or name, not by a generic 'dropship' token", () => {
    const dhl = { id: "so_d", name: "DHL dropship express", provider_id: "manual_manual" }
    expect(filterShippingOptionsForTomket([tomket, dhl, normal], true)).toEqual([tomket])
    expect(filterShippingOptionsForTomket([tomket, dhl, normal], false)).toEqual([dhl, normal])
    expect(filterShippingOptionsForTomket([{ id: "x", name: "Tomket dropship", provider_id: null }], true)).toHaveLength(1)
  })

  it("a mixed cart (Tomket tyre + machine) still gets the Tomket option", () => {
    // The store route applies the Tomket rule before the machine rule; the
    // machine rule alone would have removed the Tomket option.
    const afterMachineRule = [normal, pickup]
    expect(filterShippingOptionsForTomket([tomket, ...afterMachineRule], true)).toEqual([tomket])
  })
})
