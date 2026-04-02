import { describe, expect, it } from "@jest/globals"

import { isMagyarPostaShippingOption } from "../gepek-cart-rules"

describe("gepek-cart-rules", () => {
  it("detects Magyar Posta options from provider id", () => {
    expect(
      isMagyarPostaShippingOption({
        provider_id: "manual_magyar-posta",
      })
    ).toBe(true)

    expect(
      isMagyarPostaShippingOption({
        provider_id: "manual_magyar_posta",
      })
    ).toBe(true)
  })

  it("detects Magyar Posta options from shipping option text", () => {
    expect(
      isMagyarPostaShippingOption({
        name: "Magyar Posta házhozszállítás",
      })
    ).toBe(true)

    expect(
      isMagyarPostaShippingOption({
        type: { label: "MPL csomagpont" },
      })
    ).toBe(true)
  })

  it("does not flag non-Posta options", () => {
    expect(
      isMagyarPostaShippingOption({
        provider_id: "manual_teherguminet",
        name: "Saját szállítás",
      })
    ).toBe(false)
  })
})
