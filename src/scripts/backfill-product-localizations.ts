import type { ExecArgs, Logger } from "@medusajs/types"
import { ContainerRegistrationKeys } from "@medusajs/utils"

import {
  extractLocalizationFromMetadata,
  normalizeProductLocalizationValues,
  type ProductLocalizationValues,
} from "../lib/product-localization"
import { PRODUCT_LOCALIZATION_MODULE } from "../modules/product-localization"

type QueryProduct = {
  id: string
  metadata?: Record<string, unknown> | null
}

type QueryProductLocalization = {
  id: string
  product_id?: string | null
  title_hu?: string | null
  title_sk?: string | null
  description_hu?: string | null
  description_sk?: string | null
}

type QueryService = {
  graph: <T = Record<string, unknown>>(
    queryConfig: Record<string, unknown>
  ) => Promise<{
    data: T[]
    metadata?: { count?: number }
  }>
}

type ProductLocalizationModuleService = {
  createProductLocalizations: (
    data: Array<Record<string, unknown>>
  ) => Promise<Array<Record<string, unknown>>>
  updateProductLocalizations: (
    data: Array<Record<string, unknown>>
  ) => Promise<Array<Record<string, unknown>>>
}

const hasAnyValue = (values: ProductLocalizationValues) =>
  Boolean(
    values.title_hu ||
      values.title_sk ||
      values.description_hu ||
      values.description_sk
  )

export default async function backfillProductLocalizations({ container }: ExecArgs) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve("query") as QueryService
  const localizationService = container.resolve(
    PRODUCT_LOCALIZATION_MODULE
  ) as ProductLocalizationModuleService

  const limit = 100
  let offset = 0
  let count = 0
  let scanned = 0
  let created = 0
  let updated = 0

  logger.info("Backfilling product localizations from metadata...")

  do {
    const { data: products, metadata } = await query.graph<QueryProduct>({
      entity: "product",
      fields: ["id", "metadata"],
      pagination: {
        take: limit,
        skip: offset,
      },
    })

    count = metadata?.count ?? 0
    offset += limit
    scanned += products.length

    const productIds = products.map((product) => product.id)
    const existingByProductId = new Map<string, QueryProductLocalization>()

    if (productIds.length) {
      try {
        const { data: existingRows } = await query.graph<QueryProductLocalization>({
          entity: "product_localization",
          fields: [
            "id",
            "product_id",
            "title_hu",
            "title_sk",
            "description_hu",
            "description_sk",
          ],
          filters: {
            product_id: productIds,
          },
          pagination: {
            take: productIds.length,
            skip: 0,
          },
        })

        for (const row of existingRows) {
          if (typeof row.product_id === "string" && row.product_id.trim().length) {
            existingByProductId.set(row.product_id, row)
          }
        }
      } catch {
        // no-op fallback
      }
    }

    const toCreate: Array<Record<string, unknown>> = []
    const toUpdate: Array<Record<string, unknown>> = []

    for (const product of products) {
      const fromMetadata = normalizeProductLocalizationValues(
        extractLocalizationFromMetadata(product.metadata)
      )

      if (!hasAnyValue(fromMetadata)) {
        continue
      }

      const existing = existingByProductId.get(product.id)
      if (!existing?.id) {
        toCreate.push({
          product_id: product.id,
          title_hu: fromMetadata.title_hu || null,
          title_sk: fromMetadata.title_sk || null,
          description_hu: fromMetadata.description_hu || null,
          description_sk: fromMetadata.description_sk || null,
        })
        continue
      }

      const current = normalizeProductLocalizationValues({
        title_hu: existing.title_hu ?? "",
        title_sk: existing.title_sk ?? "",
        description_hu: existing.description_hu ?? "",
        description_sk: existing.description_sk ?? "",
      })

      if (
        current.title_hu === fromMetadata.title_hu &&
        current.title_sk === fromMetadata.title_sk &&
        current.description_hu === fromMetadata.description_hu &&
        current.description_sk === fromMetadata.description_sk
      ) {
        continue
      }

      toUpdate.push({
        id: existing.id,
        title_hu: fromMetadata.title_hu || null,
        title_sk: fromMetadata.title_sk || null,
        description_hu: fromMetadata.description_hu || null,
        description_sk: fromMetadata.description_sk || null,
      })
    }

    if (toCreate.length) {
      await localizationService.createProductLocalizations(toCreate)
      created += toCreate.length
    }

    if (toUpdate.length) {
      await localizationService.updateProductLocalizations(toUpdate)
      updated += toUpdate.length
    }
  } while (count > offset)

  logger.info(
    `Backfill finished. scanned=${scanned}, created=${created}, updated=${updated}`
  )
}

