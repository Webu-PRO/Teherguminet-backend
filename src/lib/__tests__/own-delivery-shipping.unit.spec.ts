import { describe, expect, it } from "@jest/globals"
import type { OrderShippingMethodDTO } from "@medusajs/types"

import {
  isOwnDeliveryShippingMethod,
  isPickupShippingMethod,
} from "../own-delivery-shipping"

const asMethod = (
  input: Partial<OrderShippingMethodDTO> & Record<string, unknown>
) => input as unknown as OrderShippingMethodDTO

describe("own-delivery-shipping", () => {
  it("detects own-delivery methods from Hungarian labels", () => {
    const method = asMethod({
      name: "Saját szállítás (2-6 munkanap)",
      provider_id: "manual_teherguminet",
    })

    expect(isOwnDeliveryShippingMethod(method)).toBe(true)
  })

  it("rejects pickup-like methods even when manual provider is used", () => {
    const method = asMethod({
      name: "Személyes átvétel",
      provider_id: "manual",
    })

    expect(isPickupShippingMethod(method)).toBe(true)
    expect(isOwnDeliveryShippingMethod(method)).toBe(false)
  })
})
