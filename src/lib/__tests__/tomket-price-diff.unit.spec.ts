import { tomketPricesUnchanged } from "../tomket-import"

describe("tomketPricesUnchanged", () => {
  const next = [
    { amount: 52000, currency_code: "huf" },
    { amount: 130.5, currency_code: "eur" },
  ]

  it("skips a variant whose prices already match", () => {
    expect(
      tomketPricesUnchanged(
        [
          { amount: "130.5", currency_code: "EUR" },
          { amount: 52000, currency_code: "huf" },
        ],
        next
      )
    ).toBe(true)
  })

  it("updates when an amount changed", () => {
    expect(
      tomketPricesUnchanged(
        [
          { amount: 51000, currency_code: "huf" },
          { amount: 130.5, currency_code: "eur" },
        ],
        next
      )
    ).toBe(false)
  })

  it("updates when a currency is missing or extra", () => {
    expect(
      tomketPricesUnchanged([{ amount: 52000, currency_code: "huf" }], next)
    ).toBe(false)
    expect(
      tomketPricesUnchanged(
        [
          { amount: 52000, currency_code: "huf" },
          { amount: 130.5, currency_code: "eur" },
          { amount: 1, currency_code: "usd" },
        ],
        next
      )
    ).toBe(false)
  })

  it("updates when there are no prices yet", () => {
    expect(tomketPricesUnchanged(null, next)).toBe(false)
    expect(tomketPricesUnchanged([], next)).toBe(false)
  })
})
