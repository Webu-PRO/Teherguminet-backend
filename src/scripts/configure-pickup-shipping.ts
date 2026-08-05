import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import {
  PICKUP_LOCATIONS,
  PICKUP_OPTION_CODE,
  findExistingOption,
  pickupOptionData,
  pickupOptionDescription,
  pickupOptionType,
  type PickupLocation,
} from "../lib/pickup"

/**
 * Make personal collection render as collection in checkout.
 *
 * The store already has the row — "Helyszíni átvétel", free in both currencies
 * — and the code around it was always ready: `isPickupShippingMethod` routes
 * pickup orders through their own flow, `pickup-fulfillment-cancelled` handles
 * their cancellations, and the checkout lists pickup as its own group with its
 * own address.
 *
 * What the row lacks is its *type*. Every manual option in this store carries
 * the generic `default_shipping_option` type and a `{"id":"manual-fulfillment"}`
 * data blob, so all three of the checkout's pickup checks miss and collection
 * shows up as an ordinary delivery row with no address.
 *
 * ## Why the fulfillment service and not the workflow
 *
 * `updateShippingOptionsWorkflow` with an inline `type` object dies on this
 * Medusa (2.13.2) — the workflow routes through its create step and MikroORM
 * throws `Cannot read properties of undefined (reading 'properties')` while
 * expanding a populate path. Verified against production: it fails before
 * writing anything.
 *
 * So the type is upserted on its own, and each option gets nothing but the
 * resulting `shipping_option_type_id` — a plain column — plus its data. No
 * nested creation anywhere.
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
 * Idempotent — a second run finds the type already there and rewrites the same
 * values.
 *
 * Run:  npx medusa exec src/scripts/configure-pickup-shipping.ts
 */

type StoreOption = {
  id: string
  name?: string | null
  type?: { code?: string | null } | null
  data?: Record<string, unknown> | null
}

type ShippingOptionType = { id: string; code?: string | null }

export default async function configurePickupShipping({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const fulfillment = container.resolve(Modules.FULFILLMENT)

  const { data } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "type.code", "data"],
  })
  const options = (data ?? []) as StoreOption[]
  logger.info(
    `[pickup-shipping] ${options.length} existing option(s): ${
      options.map((o) => `${o.name} [${o.type?.code ?? "no type"}]`).join(", ") || "(none)"
    }`
  )

  const toConvert: Array<{ location: PickupLocation; option: StoreOption }> = []
  const missing: PickupLocation[] = []

  for (const location of PICKUP_LOCATIONS) {
    const existing = findExistingOption(options, location)
    if (existing) {
      toConvert.push({ location, option: existing })
    } else {
      missing.push(location)
    }
  }

  if (!toConvert.length) {
    logger.error(
      `[pickup-shipping] no row found for: ${missing
        .map((l) => `"${l.option_name}"`)
        .join(", ")}. Create the shipping option in Admin first, then re-run — this script converts an existing row, it does not invent pricing for a new one.`
    )
    return
  }

  // 1. One shared pickup type for the whole store. Reused when it is already
  //    there, so a second run does not stack duplicate type rows.
  const { data: existingTypes } = await query.graph({
    entity: "shipping_option_type",
    fields: ["id", "code"],
  })
  let pickupType = ((existingTypes ?? []) as ShippingOptionType[]).find(
    (type) => type.code === PICKUP_OPTION_CODE
  )

  if (pickupType) {
    logger.info(`[pickup-shipping] reusing existing "${PICKUP_OPTION_CODE}" type ${pickupType.id}`)
  } else {
    const [created] = await fulfillment.upsertShippingOptionTypes([pickupOptionType()])
    pickupType = created
    logger.info(`[pickup-shipping] created "${PICKUP_OPTION_CODE}" type ${pickupType.id}`)
  }

  // 2. Point each row at that type and give it its address. Scalar column plus
  //    a data blob — nothing nested, nothing else touched.
  //
  //    One call per row: the module's updateShippingOptions takes (id, data),
  //    not an array of objects carrying their own id.
  for (const { location, option } of toConvert) {
    await fulfillment.updateShippingOptions(option.id, {
      shipping_option_type_id: pickupType.id,
      data: pickupOptionData(location, option.data),
    })
    logger.info(
      `[pickup-shipping] converted "${option.name}" (${option.id}): type ${
        option.type?.code ?? "none"
      } -> ${PICKUP_OPTION_CODE}; ${pickupOptionDescription(location)}`
    )
  }

  if (missing.length) {
    logger.warn(
      `[pickup-shipping] no row found for: ${missing
        .map((l) => `"${l.option_name}"`)
        .join(", ")}. Create them in Admin and re-run.`
    )
  }

  logger.info(
    `[pickup-shipping] done. Converted ${toConvert.length} row(s). Nothing created, nothing deleted, prices untouched.`
  )
}
