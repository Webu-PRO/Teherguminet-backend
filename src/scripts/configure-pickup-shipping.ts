import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  updateShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows"

import {
  PICKUP_LOCATIONS,
  PICKUP_OPTION_CODE,
  findExistingOption,
  pickupOptionData,
  pickupOptionName,
  pickupOptionType,
  type PickupLocation,
} from "../lib/pickup"

/**
 * Make personal collection render as collection in checkout.
 *
 * The store already has the row — "Helyszíni átvétel", free in both
 * currencies — and the code around it was always ready: `isPickupShippingMethod`
 * routes pickup orders through their own flow, `pickup-fulfillment-cancelled`
 * handles their cancellations, and the checkout lists pickup as its own group
 * with its own address.
 *
 * What the row lacks is its *type*. Every manual option in this store carries
 * the generic `default_shipping_option` type and a `{"id":"manual-fulfillment"}`
 * data blob, so all three of the checkout's pickup checks miss and collection
 * shows up as an ordinary delivery row with no address. This gives the row the
 * pickup type and the address, and changes nothing else.
 *
 * Deliberately conservative:
 * - It CONVERTS the row that is already there rather than adding a second one
 *   beside it, so buyers keep the wording they know and past orders keep
 *   pointing at a live option.
 * - It NEVER deletes. This store also carries "Osobný odber " and "Doručenie
 *   na adresu" — Slovak leftovers from the base template. Removing those is a
 *   separate decision with its own blast radius, not a side effect of this.
 * - It does NOT touch prices, zone, profile or provider. Collection is already
 *   free in EUR and HUF; silently repricing a live option is not this script's
 *   job.
 * - Existing `data` is merged, not replaced: `data.id` is what the manual
 *   fulfillment provider keys off.
 *
 * Idempotent — a second run finds the type already correct and rewrites the
 * same values.
 *
 * Run:  npx medusa exec src/scripts/configure-pickup-shipping.ts
 */
const MANUAL_PROVIDER = "manual_manual"

type StoreOption = {
  id: string
  name?: string | null
  service_zone_id?: string | null
  shipping_profile_id?: string | null
  type?: { code?: string | null } | null
  data?: Record<string, unknown> | null
}

export default async function configurePickupShipping({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)

  const { data } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "service_zone_id",
      "shipping_profile_id",
      "type.code",
      "data",
    ],
  })
  const options = (data ?? []) as StoreOption[]
  logger.info(
    `[pickup-shipping] ${options.length} existing option(s): ${
      options.map((o) => `${o.name} [${o.type?.code ?? "no type"}]`).join(", ") || "(none)"
    }`
  )

  const toConvert: Array<{ location: PickupLocation; option: StoreOption }> = []
  const toCreate: PickupLocation[] = []

  for (const location of PICKUP_LOCATIONS) {
    const existing = findExistingOption(options, location)
    if (existing) {
      toConvert.push({ location, option: existing })
    } else {
      toCreate.push(location)
    }
  }

  // 1. Convert the rows that are already there.
  if (toConvert.length) {
    await updateShippingOptionsWorkflow(container).run({
      input: toConvert.map(({ location, option }) => ({
        id: option.id,
        type: pickupOptionType(location),
        data: pickupOptionData(location, option.data),
      })),
    })
    for (const { location, option } of toConvert) {
      logger.info(
        `[pickup-shipping] converted "${option.name}" (${option.id}): type ${
          option.type?.code ?? "none"
        } -> ${PICKUP_OPTION_CODE}, address ${location.address_1}, ${location.postal_code} ${location.city}`
      )
    }
  }

  if (!toCreate.length) {
    logger.info("[pickup-shipping] done. Nothing to create; every collection point already had a row.")
    return
  }

  // 2. Anything with no row yet gets created. Only now do we need a zone, a
  //    profile and the store's currencies — a store where every point already
  //    exists should not fail because one of those lookups came back empty.
  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })
  const stockLocationId = stockLocations?.[0]?.id as string | undefined

  // Resolve the zone that actually covers Hungary rather than taking whichever
  // zone comes back first: the API promises no order, and on a store with a
  // second zone that gamble can hide collection from exactly the buyers it
  // exists for. Every collection point is in Hungary.
  const { data: sets } = await query.graph({
    entity: "fulfillment_set",
    fields: [
      "service_zones.id",
      "service_zones.name",
      "service_zones.geo_zones.country_code",
    ],
  })
  const zones = (sets ?? []).flatMap(
    (set: {
      service_zones?: Array<{
        id: string
        name?: string
        geo_zones?: Array<{ country_code?: string | null }>
      }>
    }) => set.service_zones ?? []
  )
  const huZone = zones.find((zone) =>
    (zone.geo_zones ?? []).some((geo) => geo.country_code?.toLowerCase() === "hu")
  )
  const serviceZoneId =
    huZone?.id ??
    options.find((o) => o.service_zone_id)?.service_zone_id ??
    zones[0]?.id

  let shippingProfileId = options.find((o) => o.shipping_profile_id)
    ?.shipping_profile_id as string | undefined
  if (!shippingProfileId) {
    const { data: profiles } = await query.graph({
      entity: "shipping_profile",
      fields: ["id"],
    })
    shippingProfileId = profiles?.[0]?.id as string | undefined
  }

  // Prices come from the store's own regions. A hardcoded currency list means
  // a shop that later sells in another one gets a collection option that is
  // invisible in that region.
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  })
  const currencyCodes = [
    ...new Set(
      (regions ?? [])
        .map((r: { currency_code?: string | null }) =>
          (r.currency_code ?? "").trim().toLowerCase()
        )
        .filter(Boolean)
    ),
  ] as string[]

  if (!stockLocationId || !serviceZoneId || !shippingProfileId || !currencyCodes.length) {
    logger.error(
      `[pickup-shipping] cannot create ${toCreate
        .map((l) => l.option_name)
        .join(", ")}: missing stock location (${stockLocationId}) / service zone (${serviceZoneId}) / shipping profile (${shippingProfileId}) / currencies (${
        currencyCodes.join(", ") || "none"
      }). Set them up in Admin → Settings → Locations and Regions first.`
    )
    return
  }

  // Manual provider on the stock location — best-effort and idempotent.
  try {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocationId },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: MANUAL_PROVIDER },
    })
    logger.info(`[pickup-shipping] linked ${MANUAL_PROVIDER} to location ${stockLocationId}`)
  } catch (error) {
    logger.info(
      `[pickup-shipping] ${MANUAL_PROVIDER} link already present or failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  const { result } = await createShippingOptionsWorkflow(container).run({
    input: toCreate.map((location) => ({
      name: pickupOptionName(location),
      price_type: "flat" as const,
      provider_id: MANUAL_PROVIDER,
      service_zone_id: serviceZoneId,
      shipping_profile_id: shippingProfileId,
      type: pickupOptionType(location),
      data: pickupOptionData(location),
      prices: currencyCodes.map((currency_code) => ({
        currency_code,
        amount: 0,
        rules: [],
      })),
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" },
        { attribute: "is_return", value: "false", operator: "eq" },
      ],
    })),
  })
  logger.info(
    `[pickup-shipping] created ${(result ?? []).length} option(s): ${toCreate
      .map((l) => l.option_name)
      .join(", ")} (free in ${currencyCodes.join(", ")})`
  )

  logger.info(
    `[pickup-shipping] done. Code "${PICKUP_OPTION_CODE}", points: ${PICKUP_LOCATIONS.map(
      (l) => `${l.option_name} @ ${l.address_1}, ${l.postal_code} ${l.city}`
    ).join("; ")}. Nothing was deleted.`
  )
}
