import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"
import type { Link } from "@medusajs/modules-sdk"
import type { MedusaContainer } from "@medusajs/types"

/**
 * The shipping option the shop uses to hand an order (or the Tomket part of
 * it) to the supplier. Creating a fulfillment with it fires
 * subscribers/tomket-fulfillment-created.ts, which places the order on the
 * Tomket API. It is admin-only: `enabled_in_store=false` keeps it out of the
 * checkout, shoppers keep choosing the normal delivery options and pay the
 * shop's shipping fee; the supplier's per-piece fee is already in the price
 * (or absorbed, see TOMKET_INCLUDE_SHIPPING_IN_PRICE).
 */

/** module id "tomket" + provider identifier "tomket" */
export const TOMKET_PROVIDER_ID = "tomket_tomket"
export const TOMKET_SHIPPING_OPTION_NAME = "Tomket dropship"
export const TOMKET_SHIPPING_TYPE_CODE = "tomket-dropship"

export type TomketShippingOption = {
  id: string
  name: string | null
  provider_id: string | null
  service_zone_id: string | null
}

type StockLocationRecord = {
  id: string
  name?: string | null
  fulfillment_sets?: Array<{
    id: string
    service_zones?: Array<{ id: string }> | null
  }> | null
  fulfillment_providers?: Array<{ id: string }> | null
}

export const findTomketShippingOption = async (
  container: MedusaContainer
): Promise<TomketShippingOption | null> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "provider_id", "service_zone_id", "deleted_at"],
    filters: { provider_id: TOMKET_PROVIDER_ID },
  })

  const option = (data ?? []).find(
    (row) => !(row as { deleted_at?: string | null }).deleted_at
  ) as TomketShippingOption | undefined

  return option ?? null
}

/**
 * Creates the admin-only Tomket shipping option once. Reuses the existing
 * one on later calls, so it is safe to run from a button and from the
 * auto-forward path alike.
 */
export const ensureTomketShippingOption = async (
  container: MedusaContainer
): Promise<{ option: TomketShippingOption; created: boolean }> => {
  const existing = await findTomketShippingOption(container)
  if (existing) {
    return { option: existing, created: false }
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve<Link>(ContainerRegistrationKeys.LINK)
  const fulfillment = container.resolve(Modules.FULFILLMENT)

  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: [
      "id",
      "name",
      "fulfillment_sets.id",
      "fulfillment_sets.service_zones.id",
      "fulfillment_providers.id",
    ],
  })

  // The location that already has delivery configured (a service zone) is
  // where the shop's other shipping options live; use the same zone so the
  // option applies to the same countries.
  const location = ((locations ?? []) as StockLocationRecord[]).find((row) =>
    (row.fulfillment_sets ?? []).some((set) => (set.service_zones ?? []).length)
  )
  const serviceZoneId = location?.fulfillment_sets
    ?.flatMap((set) => set.service_zones ?? [])
    .map((zone) => zone.id)[0]

  if (!location || !serviceZoneId) {
    throw new Error(
      "Nincs olyan raktár, amelyhez szállítási zóna tartozik — előbb a Settings → Locations & Shipping alatt kell egy zónát felvenni."
    )
  }

  const [profile] = await fulfillment.listShippingProfiles({ type: "default" })
  const shippingProfile =
    profile ?? (await fulfillment.listShippingProfiles({}))[0]
  if (!shippingProfile) {
    throw new Error("Nincs shipping profile a boltban.")
  }

  // The provider must be enabled on the location for the option to be usable.
  const alreadyLinked = (location.fulfillment_providers ?? []).some(
    (provider) => provider.id === TOMKET_PROVIDER_ID
  )
  if (!alreadyLinked) {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: TOMKET_PROVIDER_ID },
    })
  }

  const { result } = await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: TOMKET_SHIPPING_OPTION_NAME,
        price_type: "flat",
        provider_id: TOMKET_PROVIDER_ID,
        service_zone_id: serviceZoneId,
        shipping_profile_id: shippingProfile.id,
        data: { id: "tomket" },
        type: {
          label: TOMKET_SHIPPING_OPTION_NAME,
          description:
            "A beszállító (Tomket) raktárából, közvetlenül a vevőnek. Csak admin használatra.",
          code: TOMKET_SHIPPING_TYPE_CODE,
        },
        prices: [
          { currency_code: "huf", amount: 0 },
          { currency_code: "eur", amount: 0 },
        ],
        rules: [
          { attribute: "enabled_in_store", operator: "eq", value: "false" },
          { attribute: "is_return", operator: "eq", value: "false" },
        ],
      },
    ],
  })

  const created = result[0]
  return {
    option: {
      id: created.id,
      name: created.name,
      provider_id: created.provider_id ?? TOMKET_PROVIDER_ID,
      service_zone_id: created.service_zone_id ?? serviceZoneId,
    },
    created: true,
  }
}
