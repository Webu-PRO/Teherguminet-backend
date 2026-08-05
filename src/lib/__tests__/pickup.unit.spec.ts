import { describe, expect, it } from "@jest/globals"
import type { OrderShippingMethodDTO } from "@medusajs/types"

import { isOwnDeliveryShippingMethod, isPickupShippingMethod } from "../own-delivery-shipping"
import {
  PICKUP_LOCATIONS,
  PICKUP_OPTION_CODE,
  PICKUP_OPTION_DESCRIPTION,
  PICKUP_OPTION_LABEL,
  findExistingOption,
  pickupOptionData,
  pickupOptionDescription,
  pickupOptionName,
  pickupOptionType,
  sameOptionName,
} from "../pickup"

const asMethod = (
  input: Partial<OrderShippingMethodDTO> & Record<string, unknown>
) => input as unknown as OrderShippingMethodDTO

/** What the store returns for an option once this config has run. */
const shippingMethodFor = (location: (typeof PICKUP_LOCATIONS)[number]) =>
  asMethod({
    name: pickupOptionName(location),
    provider_id: "manual_manual",
    type: pickupOptionType(),
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

  it("keeps every point's id and option name unique", () => {
    const ids = PICKUP_LOCATIONS.map((l) => l.id)
    const names = PICKUP_LOCATIONS.map((l) => l.option_name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it("names each point after a row the store already has", () => {
    // The whole point of the conversion: matching the existing name is what
    // makes this update that row instead of adding a duplicate next to it.
    expect(PICKUP_LOCATIONS[0].option_name).toBe("Helyszíni átvétel")
  })
})

describe("the option this config produces", () => {
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
    expect(pickupOptionType().code).toBe(PICKUP_OPTION_CODE)
  })

  it("shares one type across every collection point", () => {
    // The type says what kind of shipping this is; which point the buyer
    // collects from lives on each option's own data. Sharing it means the
    // store ends up with exactly one `pickup` type row, however many points
    // it grows — and the script upserts that one row rather than per option.
    expect(pickupOptionType()).toEqual({
      label: PICKUP_OPTION_LABEL,
      description: PICKUP_OPTION_DESCRIPTION,
      code: PICKUP_OPTION_CODE,
    })
  })

  it("carries a type label the storefront's second check also matches", () => {
    // "átvétel" is the substring isPickupOption looks for, so the label alone
    // would still group it correctly if the code were ever lost.
    expect(PICKUP_OPTION_LABEL.toLowerCase()).toContain("átvétel")
  })

  it("puts the address in data as an object, not a string", () => {
    // The checkout hands data.pickup_address to formatAddress, which drops a
    // string silently — the buyer would see a pickup row with no address.
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

  it("keeps whatever the row already carried in data", () => {
    // data.id is what the manual fulfillment provider keys off. Replacing the
    // blob instead of merging it would break fulfilling these orders.
    const merged = pickupOptionData(PICKUP_LOCATIONS[0], { id: "manual-fulfillment" })
    expect(merged.id).toBe("manual-fulfillment")
    expect(merged.type).toBe(PICKUP_OPTION_CODE)
  })

  it("names the collection point in the description an operator reads", () => {
    for (const location of PICKUP_LOCATIONS) {
      const description = pickupOptionDescription(location)
      expect(description).toContain(location.address_1)
      expect(description).toContain(location.city)
    }
  })
})

describe("matching the row already in the store", () => {
  it("compares names on trimmed text", () => {
    // This store has a row literally named "Osobný odber " — with the trailing
    // space. An exact-match lookup would miss rows like that.
    expect(sameOptionName("Helyszíni átvétel ", "Helyszíni átvétel")).toBe(true)
    expect(sameOptionName(" Osobný odber", "Osobný odber ")).toBe(true)
    expect(sameOptionName("Helyszíni átvétel", "Osobný odber")).toBe(false)
    expect(sameOptionName(null, "Helyszíni átvétel")).toBe(false)
  })

  it("finds the existing row for a collection point", () => {
    const options = [
      { id: "so_1", name: "GLS Házhozszállítás (1-2 nap)" },
      { id: "so_2", name: "Helyszíni átvétel" },
      { id: "so_3", name: "Osobný odber " },
    ]
    expect(findExistingOption(options, PICKUP_LOCATIONS[0])?.id).toBe("so_2")
  })

  it("leaves the Slovak leftover row alone", () => {
    // "Osobný odber " is a base-template leftover in this Hungarian shop.
    // Removing it is a separate decision — this config must never claim it.
    const options = [{ id: "so_3", name: "Osobný odber " }]
    expect(findExistingOption(options, PICKUP_LOCATIONS[0])).toBeUndefined()
  })

  it("reports nothing to convert on a store without the row", () => {
    expect(findExistingOption([{ id: "so_1", name: "GLS" }], PICKUP_LOCATIONS[0])).toBeUndefined()
  })
})
