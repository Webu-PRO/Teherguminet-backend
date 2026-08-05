/**
 * Personal collection — the collection points and the shape of the shipping
 * option that represents each one.
 *
 * This shop already knows how to *recognise* a pickup shipping method:
 * `isPickupShippingMethod` in own-delivery-shipping.ts drives the order flow,
 * and `isPickupOption` in the storefront's checkout groups pickup separately
 * from courier delivery. The store also already has the row — "Helyszíni
 * átvétel", free in both currencies.
 *
 * What it does not have is the *type*. Every manual option in this store
 * carries the generic `default_shipping_option` type and a
 * `{"id":"manual-fulfillment"}` data blob, so all three of the checkout's
 * pickup checks miss and collection renders as an ordinary delivery row with
 * no address. This module holds the contract that fixes that, so the script
 * that applies it and the tests that guard it read it from one place.
 *
 * One option per collection point, which is how the checkout already models
 * it — it lists `pickupMethods` as their own group and reads each one's
 * address off `data.pickup_address`. That differs from the sister shop, where
 * a single option carries the chosen point in the shipping method's data; do
 * not port that shape here without changing the checkout to match.
 */

/**
 * `shipping_option.type.code`. The storefront's `isPickupOption` checks this
 * first, and it is server-owned — a renamed option in Admin therefore cannot
 * silently turn collection back into courier delivery.
 */
export const PICKUP_OPTION_CODE = "pickup"

/** The type's label. Contains "átvétel", which is also the checkout's second check. */
export const PICKUP_OPTION_LABEL = "Személyes átvétel"

export type PickupLocation = {
  id: string
  /** Short name; distinguishes the rows once there is more than one point. */
  label: string
  /**
   * The option row's name — deliberately the name already in the store, so the
   * script converts that row instead of adding a duplicate beside it, and
   * buyers keep seeing the wording they already know.
   */
  option_name: string
  address_1: string
  postal_code: string
  city: string
  country_code: string
}

/**
 * The collection points. Adding one is a data change here plus a re-run of
 * `configure-pickup-shipping.ts` — no checkout work, because the checkout
 * renders whatever pickup options the store returns.
 *
 * Bakonyszombathely is the address the storefront footer and contact details
 * already carry.
 */
export const PICKUP_LOCATIONS: readonly PickupLocation[] = [
  {
    id: "bakonyszombathely",
    label: "Bakonyszombathely",
    option_name: "Helyszíni átvétel",
    address_1: "Bem utca 36.",
    postal_code: "2884",
    city: "Bakonyszombathely",
    country_code: "hu",
  },
]

export const pickupOptionName = (location: PickupLocation): string =>
  location.option_name

export const pickupOptionDescription = (location: PickupLocation): string =>
  `Átvétel egyeztetés után — ${location.address_1}, ${location.postal_code} ${location.city}.`

/**
 * `data.pickup_address` is read by the checkout's `extractPickupAddress` and
 * handed to `formatAddress`, so it has to be an address *object* — a string
 * there is silently ignored and the buyer sees a pickup row with no address.
 *
 * Whatever the row already carried is preserved: `data.id` is what the manual
 * fulfillment provider keys off, and dropping it would break fulfilling these
 * orders.
 */
export const pickupOptionData = (
  location: PickupLocation,
  existing?: Record<string, unknown> | null
) => ({
  ...(existing ?? {}),
  type: PICKUP_OPTION_CODE,
  pickup_location: location.id,
  pickup_address: {
    address_1: location.address_1,
    city: location.city,
    postal_code: location.postal_code,
    country_code: location.country_code,
  },
})

/**
 * One shared type across every collection point.
 *
 * The type says *what kind* of shipping this is; which point the buyer collects
 * from lives on each option's own `data.pickup_address`. Keeping it shared also
 * means a store ends up with exactly one `pickup` type row no matter how many
 * points it grows.
 */
export const PICKUP_OPTION_DESCRIPTION =
  "Átvétel egyeztetés után, a megadott telephelyen."

export const pickupOptionType = () => ({
  label: PICKUP_OPTION_LABEL,
  description: PICKUP_OPTION_DESCRIPTION,
  code: PICKUP_OPTION_CODE,
})

/** Names compare on trimmed text: one row in this store ships with a trailing space. */
export const sameOptionName = (a?: string | null, b?: string | null): boolean =>
  (a ?? "").trim() === (b ?? "").trim()

/** The store row this location's option lives on, if it is already there. */
export const findExistingOption = <T extends { name?: string | null }>(
  options: readonly T[],
  location: PickupLocation
): T | undefined =>
  options.find((option) => sameOptionName(option?.name, location.option_name))
