import {
  createPricePreferencesWorkflow,
  updatePricePreferencesWorkflow,
  updateRegionsWorkflow,
} from "@medusajs/core-flows"
import type { ExecArgs, Logger } from "@medusajs/types"
import { ContainerRegistrationKeys } from "@medusajs/utils"

import {
  buildRegionNetPreferencePlan,
  filterRegionsByCountryCodes,
  parseCountryCodeList,
  type QueryPricePreference,
  type QueryRegion,
} from "./pricing-net-preferences"

type QueryService = {
  graph: <T = Record<string, unknown>>(
    queryConfig: Record<string, unknown>
  ) => Promise<{
    data: T[]
    metadata?: { count?: number }
  }>
}

const DEFAULT_NET_COUNTRIES = "hu,sk"
const PAGE_SIZE = 200

const readAllRegions = async (query: QueryService) => {
  const rows: QueryRegion[] = []
  let skip = 0
  let count = 0

  do {
    const { data, metadata } = await query.graph<QueryRegion>({
      entity: "region",
      fields: [
        "id",
        "currency_code",
        "is_tax_inclusive",
        "countries.iso_2",
      ],
      pagination: {
        take: PAGE_SIZE,
        skip,
      },
    })

    rows.push(...data)
    skip += PAGE_SIZE
    count = metadata?.count ?? rows.length
  } while (skip < count)

  return rows
}

const readAllPricePreferences = async (query: QueryService) => {
  const rows: QueryPricePreference[] = []
  let skip = 0
  let count = 0

  do {
    const { data, metadata } = await query.graph<QueryPricePreference>({
      entity: "price_preference",
      fields: ["id", "attribute", "value", "is_tax_inclusive"],
      pagination: {
        take: PAGE_SIZE,
        skip,
      },
    })

    rows.push(...data)
    skip += PAGE_SIZE
    count = metadata?.count ?? rows.length
  } while (skip < count)

  return rows
}

export default async function ensureNetPricePreferences({
  container,
}: ExecArgs) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve("query") as QueryService

  const configuredCountries =
    process.env.PRICE_NET_COUNTRIES ?? DEFAULT_NET_COUNTRIES
  const netCountries = parseCountryCodeList(configuredCountries)

  if (!netCountries.length) {
    logger.warn(
      "pricing:ensure-net skipped because PRICE_NET_COUNTRIES resolved to an empty list."
    )
    return
  }

  const allRegions = await readAllRegions(query)
  const targetRegions = filterRegionsByCountryCodes(allRegions, netCountries)
  const targetRegionIds = targetRegions.map((region) => region.id)

  if (!targetRegionIds.length) {
    logger.warn(
      `pricing:ensure-net found no regions for countries: ${netCountries.join(", ")}`
    )
    return
  }

  const allRegionPreferences = await readAllPricePreferences(query)
  const targetRegionIdSet = new Set(targetRegionIds)
  const targetCurrencyCodeSet = new Set(
    targetRegions
      .map((region) => {
        return typeof region.currency_code === "string"
          ? region.currency_code.trim().toLowerCase()
          : ""
      })
      .filter(Boolean)
  )
  const preferences = allRegionPreferences.filter((preference) => {
    const attribute =
      typeof preference.attribute === "string"
        ? preference.attribute.trim()
        : ""
    const value =
      typeof preference.value === "string" ? preference.value.trim() : ""

    if (attribute === "region_id") {
      return targetRegionIdSet.has(value)
    }

    if (attribute === "currency_code") {
      return targetCurrencyCodeSet.has(value.toLowerCase())
    }

    return false
  })
  const plan = buildRegionNetPreferencePlan({
    targetRegions,
    preferences,
  })

  if (plan.create.length) {
    await createPricePreferencesWorkflow(container).run({
      input: plan.create,
    })
  }

  const preferenceIdsToUpdate = [
    ...new Set([...plan.updateIds, ...plan.currencyPreferenceUpdateIds]),
  ]

  if (preferenceIdsToUpdate.length) {
    await updatePricePreferencesWorkflow(container).run({
      input: {
        selector: {
          id: preferenceIdsToUpdate,
        },
        update: {
          is_tax_inclusive: false,
        },
      },
    })
  }

  if (plan.regionIdsToMakeTaxExclusive.length) {
    await updateRegionsWorkflow(container).run({
      input: {
        selector: {
          id: plan.regionIdsToMakeTaxExclusive,
        },
        update: {
          is_tax_inclusive: false,
        },
      },
    })
  }

  logger.info(
    `pricing:ensure-net done. countries=${netCountries.join(",")} target_regions=${targetRegionIds.length} created=${plan.create.length} region_pref_updated=${plan.updateIds.length} currency_pref_updated=${plan.currencyPreferenceUpdateIds.length} regions_tax_exclusive_updated=${plan.regionIdsToMakeTaxExclusive.length}`
  )
}
