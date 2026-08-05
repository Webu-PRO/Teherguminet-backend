import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  deleteShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows"

import {
  PICKUP_LOCATIONS,
  PICKUP_OPTION_CODE,
  isManagedPickupOption,
  pickupOptionData,
  pickupOptionName,
  pickupOptionType,
} from "../lib/pickup"

/**
 * Add personal collection (személyes átvétel) to checkout.
 *
 * Everything else was already here: `isPickupShippingMethod` routes pickup
 * orders through their own flow, `pickup-fulfillment-cancelled` handles their
 * cancellations, and the storefront checkout already lists pickup options as
 * their own group. What was missing is the shipping option itself — so this
 * creates it, rather than leaving it as a row somebody has to click together
 * in Admin and remember to recreate after a restore.
 *
 * One free option per collection point, each carrying `type.code = "pickup"`
 * and its address on `data.pickup_address`. That is the contract the checkout
 * reads; `src/lib/pickup.ts` owns it and the unit tests hold both ends to it.
 *
 * Idempotent: re-running converges on exactly one option per point. Order
 * matters — create BEFORE delete, so a failure halfway never leaves the store
 * without a collection option.
 *
 * Run:  npx medusa exec src/scripts/configure-pickup-shipping.ts
 */
const MANUAL_PROVIDER = "manual_manual"

/** Collection is free — one zero price per currency the store actually sells in. */
const freePrices = (currencyCodes: string[]) =>
  currencyCodes.map((currency_code) => ({ currency_code, amount: 0, rules: [] }))

export default async function configurePickupShipping({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "service_zone_id", "shipping_profile_id", "type.code"],
  })
  logger.info(
    `[pickup-shipping] existing options: ${
      (options ?? []).map((o: { name: string }) => o.name).join(", ") || "(none)"
    }`
  )

  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })
  const stockLocationId = stockLocations?.[0]?.id as string | undefined

  // Resolve the zone that actually covers Hungary rather than taking whichever
  // zone happens to come back first: the API promises no order, and on a store
  // with a second zone that gamble can hide collection from exactly the buyers
  // it exists for. Every collection point is in Hungary.
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
    ((options ?? []).find((o: { service_zone_id?: string }) => o.service_zone_id)
      ?.service_zone_id as string | undefined) ??
    zones[0]?.id

  let shippingProfileId = (options ?? []).find(
    (o: { shipping_profile_id?: string }) => o.shipping_profile_id
  )?.shipping_profile_id as string | undefined

  if (!shippingProfileId) {
    const { data: profiles } = await query.graph({
      entity: "shipping_profile",
      fields: ["id"],
    })
    shippingProfileId = profiles?.[0]?.id as string | undefined
  }

  // Prices come from the store's own regions. Hardcoding a currency list means
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
      `[pickup-shipping] missing stock location (${stockLocationId}) / service zone (${serviceZoneId}) / shipping profile (${shippingProfileId}) / currencies (${
        currencyCodes.join(", ") || "none"
      }). Set them up in Admin → Settings → Locations and Regions first.`
    )
    return
  }

  logger.info(
    `[pickup-shipping] zone ${serviceZoneId} (${
      huZone ? `HU geo zone "${huZone.name ?? "unnamed"}"` : "NO HU geo zone found — fell back"
    }), currencies: ${currencyCodes.join(", ")}`
  )

  // 1. Manual provider on the stock location — best-effort and idempotent.
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

  // 2. Create one option per collection point, BEFORE removing the old ones.
  const { result } = await createShippingOptionsWorkflow(container).run({
    input: PICKUP_LOCATIONS.map((location) => ({
      name: pickupOptionName(location),
      price_type: "flat" as const,
      provider_id: MANUAL_PROVIDER,
      service_zone_id: serviceZoneId,
      shipping_profile_id: shippingProfileId,
      type: pickupOptionType(location),
      data: pickupOptionData(location),
      prices: freePrices(currencyCodes),
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" },
        { attribute: "is_return", value: "false", operator: "eq" },
      ],
    })),
  })
  const createdIds = new Set((result ?? []).map((option: { id: string }) => option.id))
  logger.info(
    `[pickup-shipping] created ${createdIds.size} option(s): ${[...createdIds].join(", ")}`
  )

  // 3. Drop earlier copies so a re-run converges on exactly one row per point.
  //    Matched by type code, with a name fallback for anything created by hand
  //    in Admin before this script existed.
  const staleIds = (options ?? [])
    .filter(
      (option: { id: string; name: string; type?: { code?: string | null } | null }) =>
        isManagedPickupOption(option) && !createdIds.has(option.id)
    )
    .map((option: { id: string }) => option.id)

  if (staleIds.length) {
    await deleteShippingOptionsWorkflow(container).run({ input: { ids: staleIds } })
    logger.info(`[pickup-shipping] removed ${staleIds.length} stale pickup option(s)`)
  }

  logger.info(
    `[pickup-shipping] done. Free, code "${PICKUP_OPTION_CODE}", points: ${PICKUP_LOCATIONS.map(
      (l) => `${l.label} (${l.address_1}, ${l.postal_code} ${l.city})`
    ).join("; ")}.`
  )
}
