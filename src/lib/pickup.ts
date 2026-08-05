/**
 * Personal collection (személyes átvétel) — the collection points and the
 * shape of the shipping option that represents each one.
 *
 * This shop already knows how to *recognise* a pickup shipping method:
 * `isPickupShippingMethod` in own-delivery-shipping.ts drives the order flow,
 * and `isPickupOption` in the storefront's checkout groups pickup separately
 * from courier delivery. What was missing is the shipping option itself. This
 * module holds the data those two detectors have to agree on, so the script
 * that creates the option and the tests that guard it read from one place.
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

/** Shown as the option's label. Contains "átvétel", which both detectors also match on. */
export const PICKUP_OPTION_NAME = "Személyes átvétel"

export type PickupLocation = {
  id: string
  /** Short name; distinguishes the rows once there is more than one point. */
  label: string
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
    address_1: "Bem utca 36.",
    postal_code: "2884",
    city: "Bakonyszombathely",
    country_code: "hu",
  },
]

/** One row per point, but no redundant suffix while there is only one. */
export const pickupOptionName = (location: PickupLocation): string =>
  PICKUP_LOCATIONS.length > 1
    ? `${PICKUP_OPTION_NAME} — ${location.label}`
    : PICKUP_OPTION_NAME

export const pickupOptionDescription = (location: PickupLocation): string =>
  `Átvétel egyeztetés után — ${location.address_1}, ${location.postal_code} ${location.city}.`

/**
 * `data.pickup_address` is read by the checkout's `extractPickupAddress` and
 * handed to `formatAddress`, so it has to be an address *object* — a string
 * there is silently ignored and the buyer sees a pickup row with no address.
 */
export const pickupOptionData = (location: PickupLocation) => ({
  type: PICKUP_OPTION_CODE,
  pickup_location: location.id,
  pickup_address: {
    address_1: location.address_1,
    city: location.city,
    postal_code: location.postal_code,
    country_code: location.country_code,
  },
})

export const pickupOptionType = (location: PickupLocation) => ({
  label: PICKUP_OPTION_NAME,
  description: pickupOptionDescription(location),
  code: PICKUP_OPTION_CODE,
})

/** Does this option name / type belong to a collection point we manage? */
export const isManagedPickupOption = (option: {
  name?: string | null
  type?: { code?: string | null } | null
}): boolean =>
  option?.type?.code === PICKUP_OPTION_CODE ||
  PICKUP_LOCATIONS.some((location) => pickupOptionName(location) === option?.name)
