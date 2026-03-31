import { describe, expect, it } from "@jest/globals"

import { isStripePaymentProvider } from "../send-payment-receipt"

describe("send-payment-receipt workflow helpers", () => {
  it("returns true for Stripe provider identifiers", () => {
    expect(isStripePaymentProvider("stripe")).toBe(true)
    expect(isStripePaymentProvider("pp_stripe_stripe")).toBe(true)
    expect(isStripePaymentProvider("PP_STRIPE_STRIPE")).toBe(true)
  })

  it("returns false for non-Stripe identifiers", () => {
    expect(isStripePaymentProvider("manual_manual")).toBe(false)
    expect(isStripePaymentProvider("pp_paypal_paypal")).toBe(false)
  })

  it("returns false for invalid provider values", () => {
    expect(isStripePaymentProvider(null)).toBe(false)
    expect(isStripePaymentProvider(undefined)).toBe(false)
    expect(isStripePaymentProvider(42)).toBe(false)
  })
})
