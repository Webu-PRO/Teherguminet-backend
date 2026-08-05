import { describe, expect, it } from "@jest/globals"
import type { OrderShippingMethodDTO } from "@medusajs/types"

import { isOwnDeliveryShippingMethod, isPickupShippingMethod } from "../own-delivery-shipping"
import {
  PICKUP_LOCATIONS,
  PICKUP_OPTION_CODE,
  isManagedPickupOption,
  pickupOptionData,
  pickupOptionDescription,
  pickupOptionName,
  pickupOptionType,
} from "../pickup"

const asMethod = (
  input: Partial<OrderShippingMethodDTO> & Record<string, unknown>
) => input as unknown as OrderShippingMethodDTO

/** What the store returns for an option this config creates. */
const shippingMethodFor = (location: (typeof PICKUP_LOCATIONS)[number]) =>
  asMethod({
    name: pickupOptionName(location),
    provider_id: "manual_manual",
    type: pickupOptionType(location),
    data: pickupOptionData(location),
  })

describe("pickup locations", () => {
  it("has at least one collection point", () => {
    expect(PICKUP_LOCATIONS.length).toBeGreaterThan(0)
  })

  it("gives every point a full postal address", () => {
    for (const location of PICKUP_LOCATIONS) {
      expect(location.id).toMatch(/^[a-z0-9-]+$/)
      expect(location.label).toBeTruthy()
      expect(location.address_1).toBeTruthy()
      expect(location.postal_code).toMatch(/^\d{4}$/)
      expect(location.city).toBeTruthy()
      expect(location.country_code).toBe("hu")
    }
  })

  it("keeps every point's id unique", () => {
    const ids = PICKUP_LOCATIONS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("names a single point without a redundant suffix", () => {
    // A "Személyes átvétel — Bakonyszombathely" row reads as though a second
    // one exists. Only distinguish them once there is something to distinguish.
    if (PICKUP_LOCATIONS.length === 1) {
      expect(pickupOptionName(PICKUP_LOCATIONS[0])).toBe("Személyes átvétel")
    } else {
      const names = PICKUP_LOCATIONS.map(pickupOptionName)
      expect(new Set(names).size).toBe(names.length)
    }
  })
})

describe("the option this config creates", () => {
  it("is recognised by the order flow's pickup detector", () => {
    // own-delivery-shipping.ts already routes pickup orders differently. If
    // this ever stops matching, collection silently becomes a delivery.
    for (const location of PICKUP_LOCATIONS) {
      expect(isPickupShippingMethod(shippingMethodFor(location))).toBe(true)
    }
  })

  it("is never mistaken for own delivery", () => {
    for (const location of PICKUP_LOCATIONS) {
      expect(isOwnDeliveryShippingMethod(shippingMethodFor(location))).toBe(false)
    }
  })

  it("carries the type code the storefront checks first", () => {
    for (const location of PICKUP_LOCATIONS) {
      expect(pickupOptionType(location).code).toBe(PICKUP_OPTION_CODE)
    }
  })

  it("puts the address in data as an object, not a string", () => {
    // The checkout hands data.pickup_address to formatAddress. A string there
    // is silently dropped and the buyer sees a pickup row with no address.
    for (const location of PICKUP_LOCATIONS) {
      const data = pickupOptionData(location)
      expect(typeof data.pickup_address).toBe("object")
      expect(data.pickup_address).toMatchObject({
        address_1: location.address_1,
        city: location.city,
        postal_code: location.postal_code,
        country_code: location.country_code,
      })
    }
  })

  it("also marks the pickup type inside data, the checkout's third fallback", () => {
    for (const location of PICKUP_LOCATIONS) {
      expect(pickupOptionData(location).type).toBe(PICKUP_OPTION_CODE)
    }
  })

  it("names the collection point in the description an operator reads", () => {
    for (const location of PICKUP_LOCATIONS) {
      const description = pickupOptionDescription(location)
      expect(description).toContain(location.address_1)
      expect(description).toContain(location.city)
    }
  })
})

describe("isManagedPickupOption", () => {
  it("claims options carrying our type code", () => {
    expect(isManagedPickupOption({ name: "Bármi", type: { code: "pickup" } })).toBe(true)
  })

  it("claims an option created by hand under the name we use", () => {
    // So a re-run converges on one row instead of stacking a duplicate next to
    // a copy somebody made in Admin before this script existed.
    expect(
      isManagedPickupOption({ name: pickupOptionName(PICKUP_LOCATIONS[0]), type: null })
    ).toBe(true)
  })

  it("leaves courier options alone", () => {
    expect(isManagedPickupOption({ name: "GLS futár", type: { code: "gls" } })).toBe(false)
    expect(isManagedPickupOption({ name: "Saját szállítás", type: null })).toBe(false)
  })
})
