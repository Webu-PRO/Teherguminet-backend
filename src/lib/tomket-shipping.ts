import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  updateShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows"
import type { Link } from "@medusajs/modules-sdk"
import type { MedusaContainer } from "@medusajs/types"

import { resolveTomketCountry } from "./tomket-feed"
import { readTomketSettings, resolveTomketSettings } from "./tomket-settings"

/**
 * The shipping option a shopper picks for Tomket tyres: the supplier ships
 * from its own warehouse straight to the buyer. It is shown at checkout
 * (enabled_in_store=true) and, by tomket-cart-rules.ts, it is the only
 * option offered when the cart holds a Tomket tyre — and never offered
 * otherwise. Creating a fulfillment with it (the auto-forward, or the
 * operator) fires subscribers/tomket-fulfillment-created.ts, which places
 * the order on the Tomket API.
 *
 * The price the shopper pays is a flat amount from the admin Tomket
 * settings (HUF / EUR). The supplier's own per-piece fee is separate: fold
 * it into the product price with "szállítási díj beépítése", or cover it
 * with this flat amount.
 */

/** module id "tomket" + provider identifier "tomket" */
export const TOMKET_PROVIDER_ID = "tomket_tomket"
export const TOMKET_SHIPPING_OPTION_NAME = "Tomket szállítás"
export const TOMKET_SHIPPING_TYPE_CODE = "tomket-dropship"
export const TOMKET_SHIPPING_DESCRIPTION =
  "A gumit a beszállító (Tomket) raktárából szállítjuk közvetlenül Önnek."

export type TomketShippingOption = {
  id: string
  name: string | null
  provider_id: string | null
  service_zone_id: string | null
  price_type?: string | null
  rules?: Array<{ attribute?: string | null; value?: unknown }> | null
}

type StockLocationRecord = {
  id: string
  name?: string | null
  fulfillment_sets?: Array<{
    id: string
    service_zones?: Array<{
      id: string
      geo_zones?: Array<{ country_code?: string | null }> | null
    }> | null
  }> | null
  fulfillment_providers?: Array<{ id: string }> | null
}

export const findTomketShippingOption = async (
  container: MedusaContainer
): Promise<TomketShippingOption | null> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "provider_id",
      "service_zone_id",
      "price_type",
      "deleted_at",
      "rules.attribute",
      "rules.value",
    ],
    filters: { provider_id: TOMKET_PROVIDER_ID },
  })

  const option = (data ?? []).find(
    (row) => !(row as { deleted_at?: string | null }).deleted_at
  ) as TomketShippingOption | undefined

  return option ?? null
}

/** The flat shopper price per currency, from the admin settings. */
export const resolveTomketShippingPrices = async (
  container: MedusaContainer
) => {
  const settings = resolveTomketSettings(await readTomketSettings(container))
  return [
    { currency_code: "huf", amount: settings.shippingPriceHuf.value },
    { currency_code: "eur", amount: settings.shippingPriceEur.value },
  ]
}

export const isStoreEnabled = (option: TomketShippingOption) =>
  (option.rules ?? []).some(
    (rule) =>
      rule.attribute === "enabled_in_store" && String(rule.value) === "true"
  )

/**
 * Creates the Tomket shipping option once, or upgrades an earlier
 * admin-only one (the first revision hid it from the store) to the
 * shopper-facing definition. Idempotent.
 */
export const ensureTomketShippingOption = async (
  container: MedusaContainer
): Promise<{ option: TomketShippingOption; created: boolean }> => {
  const existing = await findTomketShippingOption(container)
  if (existing && isStoreEnabled(existing)) {
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
      "fulfillment_sets.service_zones.geo_zones.country_code",
      "fulfillment_providers.id",
    ],
  })

  // The location that already has delivery configured (a service zone) is
  // where the shop's other shipping options live. Prefer the zone that
  // covers the Tomket country (hu), so the option sits next to the domestic
  // delivery options rather than in, say, the Slovak zone.
  const country = resolveTomketCountry()
  const location = ((locations ?? []) as StockLocationRecord[]).find((row) =>
    (row.fulfillment_sets ?? []).some((set) => (set.service_zones ?? []).length)
  )
  const zones =
    location?.fulfillment_sets?.flatMap((set) => set.service_zones ?? []) ?? []
  const serviceZoneId = (
    zones.find((zone) =>
      (zone.geo_zones ?? []).some(
        (geo) => (geo.country_code ?? "").toLowerCase() === country
      )
    ) ?? zones[0]
  )?.id

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

  // An admin-only option from the first revision is retired rather than
  // edited in place: the rule set and the name both change, and a fresh
  // row is the one path the create workflow fully supports.
  if (existing) {
    await fulfillment.softDeleteShippingOptions([existing.id])
  }

  const { result } = await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: TOMKET_SHIPPING_OPTION_NAME,
        price_type: "flat",
        provider_id: TOMKET_PROVIDER_ID,
        service_zone_id: existing?.service_zone_id ?? serviceZoneId,
        shipping_profile_id: shippingProfile.id,
        data: { id: "tomket" },
        type: {
          label: TOMKET_SHIPPING_OPTION_NAME,
          description: TOMKET_SHIPPING_DESCRIPTION,
          code: TOMKET_SHIPPING_TYPE_CODE,
        },
        prices: await resolveTomketShippingPrices(container),
        rules: [
          { attribute: "enabled_in_store", operator: "eq", value: "true" },
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
      price_type: "flat",
    },
    created: true,
  }
}

/**
 * Re-applies the flat prices from the settings to the live option. Called
 * after the operator saves the settings, so a price change reaches the
 * checkout without recreating anything.
 */
export const syncTomketShippingOptionPrices = async (
  container: MedusaContainer
) => {
  const option = await findTomketShippingOption(container)
  if (!option || !isStoreEnabled(option)) {
    return null
  }

  await updateShippingOptionsWorkflow(container).run({
    input: [
      {
        id: option.id,
        price_type: "flat",
        prices: await resolveTomketShippingPrices(container),
      },
    ],
  })

  return option
}
