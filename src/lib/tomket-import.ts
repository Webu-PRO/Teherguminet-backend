import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createCollectionsWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductTagsWorkflow,
  createProductTypesWorkflow,
  createProductsWorkflow,
  updateInventoryLevelsWorkflow,
  updateProductVariantsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import type { MedusaContainer } from "@medusajs/types"

import { resolveTomketConfig } from "./tomket"
import { resolveTomketPricing } from "./tomket-fx"
import {
  fetchTomketFullFeed,
  fetchTomketStockFeed,
  resolveTomketCountry,
  TOMKET_TIRE_TYPES,
  type TomketTireRow,
} from "./tomket-feed"
import {
  calculateTomketPrices,
  mapTomketRowsToDrafts,
  parseTomketSku,
  type TomketProductDraft,
} from "./tomket-catalog"

export type TomketImportOptions = {
  /** Resolve and map the feed, report what would change, write nothing. */
  dryRun?: boolean
  /** Cap the number of tyres processed, for a first look at the catalogue. */
  limit?: number
  /** Tyre type codes to keep (PS, TW, ...). Empty means the whole feed. */
  types?: string[]
  /** Products per workflow call. */
  batchSize?: number
  /** Skip tyres the supplier currently has none of. */
  skipOutOfStock?: boolean
  onProgress?: (message: string) => void
}

export type TomketImportResult = {
  dryRun: boolean
  country: string
  startedAt: string
  finishedAt: string
  durationMs: number
  feed: { rows: number; unparseable: number }
  eligible: number
  created: number
  updated: number
  unchangedSkipped: number
  failed: Array<{ sku: string; reason: string }>
  preview: Array<{
    sku: string
    handle: string
    title: string
    producer: string
    type: string
    stock: number
    priceHuf: number
    priceEur: number
    costEurNet: number
  }>
}

const CHUNK = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export class TomketImportConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      `Hiányzó Tomket konfiguráció: ${missing.join(", ")}. Állítsd be ezeket az apps/backend/.env fájlban.`
    )
    this.name = "TomketImportConfigError"
  }
}

type ImportContext = {
  salesChannelIds: string[]
  shippingProfileId: string
  stockLocationId: string | null
  currencyCodes: string[]
}

const resolveImportContext = async (
  container: MedusaContainer
): Promise<ImportContext> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const [{ data: salesChannels }, { data: shippingProfiles }, { data: stockLocations }, { data: regions }] =
    await Promise.all([
      query.graph({ entity: "sales_channel", fields: ["id", "name"] }),
      query.graph({ entity: "shipping_profile", fields: ["id", "name", "type"] }),
      query.graph({ entity: "stock_location", fields: ["id", "name"] }),
      query.graph({ entity: "region", fields: ["id", "currency_code"] }),
    ])

  if (!shippingProfiles?.length) {
    throw new Error(
      "Nincs shipping profile a boltban — a Medusa termék létrehozáshoz kötelező."
    )
  }

  const defaultProfile =
    shippingProfiles.find((profile) => profile.type === "default") ??
    shippingProfiles[0]

  const currencyCodes = Array.from(
    new Set(
      (regions ?? [])
        .map((region) => (region.currency_code ?? "").toLowerCase())
        .filter(Boolean)
    )
  )

  return {
    salesChannelIds: (salesChannels ?? []).map((channel) => channel.id),
    shippingProfileId: defaultProfile.id,
    stockLocationId: stockLocations?.[0]?.id ?? null,
    currencyCodes,
  }
}

/**
 * Product types, tags and categories are shared taxonomy — create the missing
 * ones once up front so the per-product payloads can reference them by id.
 */
const ensureTaxonomy = async (
  container: MedusaContainer,
  drafts: TomketProductDraft[]
) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const producers = Array.from(new Set(drafts.map((d) => d.producer)))
  const tagValues = Array.from(new Set(drafts.flatMap((d) => d.tags)))

  const [
    { data: types },
    { data: tags },
    { data: categories },
    { data: collections },
  ] = await Promise.all([
    query.graph({ entity: "product_type", fields: ["id", "value"] }),
    query.graph({ entity: "product_tag", fields: ["id", "value"] }),
    query.graph({ entity: "product_category", fields: ["id", "handle"] }),
    query.graph({ entity: "product_collection", fields: ["id", "handle"] }),
  ])

  const collectionByHandle = new Map<string, string>(
    (collections ?? []).map((collection) => [collection.handle, collection.id])
  )

  const typeByValue = new Map<string, string>(
    (types ?? []).map((type) => [type.value, type.id])
  )
  const tagByValue = new Map<string, string>(
    (tags ?? []).map((tag) => [tag.value, tag.id])
  )
  const categoryByHandle = new Map<string, string>(
    (categories ?? []).map((category) => [category.handle, category.id])
  )

  const missingTypes = producers.filter((value) => !typeByValue.has(value))
  if (missingTypes.length) {
    const { result } = await createProductTypesWorkflow(container).run({
      input: { product_types: missingTypes.map((value) => ({ value })) },
    })
    for (const type of result) {
      typeByValue.set(type.value, type.id)
    }
  }

  const missingTags = tagValues.filter((value) => !tagByValue.has(value))
  if (missingTags.length) {
    const { result } = await createProductTagsWorkflow(container).run({
      input: { product_tags: missingTags.map((value) => ({ value })) },
    })
    for (const tag of result) {
      tagByValue.set(tag.value, tag.id)
    }
  }

  const missingCategories = drafts
    .filter((draft) => !categoryByHandle.has(draft.producerHandle))
    .reduce<Map<string, string>>((acc, draft) => {
      acc.set(draft.producerHandle, draft.producer)
      return acc
    }, new Map())

  if (missingCategories.size) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: Array.from(missingCategories.entries()).map(
          ([handle, name]) => ({ name, handle, is_active: true })
        ),
      },
    })
    for (const category of result) {
      categoryByHandle.set(category.handle, category.id)
    }
  }

  // One category per tyre type ("Személy nyári gumi") so the storefront can
  // list by vehicle + season, next to the per-brand category above.
  const missingTypeCategories = new Map<string, string>()
  for (const draft of drafts) {
    if (!categoryByHandle.has(draft.typeCategory.handle)) {
      missingTypeCategories.set(draft.typeCategory.handle, draft.typeCategory.name)
    }
  }
  if (missingTypeCategories.size) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: Array.from(missingTypeCategories.entries()).map(
          ([handle, name]) => ({ name, handle, is_active: true })
        ),
      },
    })
    for (const category of result) {
      categoryByHandle.set(category.handle, category.id)
    }
  }

  // The hand-made catalogue keeps one collection per brand; mirror that.
  const missingCollections = new Map<string, string>()
  for (const draft of drafts) {
    if (!collectionByHandle.has(draft.producerHandle)) {
      missingCollections.set(draft.producerHandle, draft.producer)
    }
  }
  if (missingCollections.size) {
    const { result } = await createCollectionsWorkflow(container).run({
      input: {
        collections: Array.from(missingCollections.entries()).map(
          ([handle, title]) => ({ title, handle })
        ),
      },
    })
    for (const collection of result) {
      collectionByHandle.set(collection.handle, collection.id)
    }
  }

  return { typeByValue, tagByValue, categoryByHandle, collectionByHandle }
}

type Taxonomy = Awaited<ReturnType<typeof ensureTaxonomy>>

const buildProductPayload = (
  draft: TomketProductDraft,
  context: ImportContext,
  taxonomy: Taxonomy
) => {
  const prices = context.currencyCodes
    .map((currency) => {
      if (currency === "huf") {
        return { amount: draft.prices.huf, currency_code: "huf" }
      }
      if (currency === "eur") {
        return { amount: draft.prices.eur, currency_code: "eur" }
      }
      return null
    })
    .filter((price): price is { amount: number; currency_code: string } =>
      Boolean(price)
    )

  return {
    title: draft.title,
    subtitle: draft.subtitle,
    handle: draft.handle,
    description: draft.description,
    status: "published" as const,
    shipping_profile_id: context.shippingProfileId,
    type_id: taxonomy.typeByValue.get(draft.producer),
    collection_id: taxonomy.collectionByHandle.get(draft.producerHandle),
    category_ids: [
      taxonomy.categoryByHandle.get(draft.producerHandle),
      taxonomy.categoryByHandle.get(draft.typeCategory.handle),
    ].filter((id): id is string => Boolean(id)),
    tag_ids: draft.tags
      .map((tag) => taxonomy.tagByValue.get(tag))
      .filter((id): id is string => Boolean(id)),
    thumbnail: draft.imageUrl,
    images: draft.imageUrl ? [{ url: draft.imageUrl }] : undefined,
    metadata: draft.productMetadata,
    sales_channels: context.salesChannelIds.map((id) => ({ id })),
    options: [{ title: "Méret", values: [draft.variantMetadata.tomket_size as string] }],
    variants: [
      {
        title: draft.variantMetadata.tomket_size as string,
        sku: draft.sku,
        // The supplier holds the stock; we mirror their count and never
        // backorder, so a sold-out tyre cannot be bought here.
        manage_inventory: true,
        allow_backorder: false,
        weight: draft.weightGrams,
        options: { "Méret": draft.variantMetadata.tomket_size as string },
        prices,
        metadata: draft.variantMetadata,
      },
    ],
  }
}

const findExistingVariants = async (
  container: MedusaContainer,
  skus: string[]
) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const found = new Map<
    string,
    { id: string; product_id?: string; inventory_item_id?: string }
  >()

  for (const chunk of CHUNK(skus, 300)) {
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku", "product_id", "inventory_items.inventory_item_id"],
      filters: { sku: chunk },
    })

    for (const variant of data ?? []) {
      if (!variant.sku) {
        continue
      }
      found.set(variant.sku, {
        id: variant.id,
        product_id: variant.product_id ?? undefined,
        inventory_item_id:
          (variant.inventory_items ?? [])[0]?.inventory_item_id ?? undefined,
      })
    }
  }

  return found
}

const syncInventoryLevels = async (
  container: MedusaContainer,
  stockLocationId: string,
  entries: Array<{ inventoryItemId: string; stock: number }>
) => {
  if (!entries.length) {
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const byItem = new Map(entries.map((entry) => [entry.inventoryItemId, entry]))

  const { data: levels } = await query.graph({
    entity: "inventory_level",
    fields: ["id", "inventory_item_id", "location_id", "stocked_quantity"],
    filters: {
      inventory_item_id: Array.from(byItem.keys()),
      location_id: stockLocationId,
    },
  })

  const existingByItem = new Map(
    (levels ?? []).map((level) => [level.inventory_item_id, level])
  )

  const creates = entries
    .filter((entry) => !existingByItem.has(entry.inventoryItemId))
    .map((entry) => ({
      inventory_item_id: entry.inventoryItemId,
      location_id: stockLocationId,
      stocked_quantity: entry.stock,
    }))

  const updates = entries
    .map((entry) => {
      const level = existingByItem.get(entry.inventoryItemId)
      if (!level || level.stocked_quantity === entry.stock) {
        return null
      }
      return {
        id: level.id,
        inventory_item_id: entry.inventoryItemId,
        location_id: stockLocationId,
        stocked_quantity: entry.stock,
      }
    })
    .filter((update): update is NonNullable<typeof update> => Boolean(update))

  if (creates.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: creates },
    })
  }

  if (updates.length) {
    await updateInventoryLevelsWorkflow(container).run({
      input: { updates },
    })
  }
}

const describeFx = (
  fx: Awaited<ReturnType<typeof resolveTomketPricing>>["fx"]
) =>
  !fx
    ? "Árfolyam: nincs."
    : fx.source === "env"
      ? `Árfolyam: ${fx.rate} Ft/EUR (kézi, TOMKET_EUR_HUF_RATE).`
      : `Árfolyam: ${fx.rate} Ft/EUR (ECB ${fx.date}${
          fx.markupPercent ? `, +${fx.markupPercent}% felár` : ""
        }).`

export const runTomketImport = async (
  container: MedusaContainer,
  options: TomketImportOptions = {}
): Promise<TomketImportResult> => {
  const startedAt = new Date()
  const report = options.onProgress ?? (() => {})

  const { config, missing } = resolveTomketConfig()
  const {
    config: pricing,
    missing: missingPricing,
    fx,
  } = await resolveTomketPricing(container)

  const allMissing = [...missing, ...missingPricing]
  if (!config || !pricing) {
    throw new TomketImportConfigError(allMissing)
  }

  report(describeFx(fx))

  const country = resolveTomketCountry()
  report(`Feed letöltése: ${country} …`)

  const feed = await fetchTomketFullFeed(config, country)
  report(
    `Feed kész: ${feed.rows.length} sor (${feed.skippedCount} feldolgozhatatlan).`
  )

  const wantedTypes = new Set(
    (options.types ?? []).map((type) => type.trim().toUpperCase()).filter(Boolean)
  )

  let rows: TomketTireRow[] = feed.rows
  if (wantedTypes.size) {
    rows = rows.filter((row) => wantedTypes.has(row.tireType))
  }
  if (options.skipOutOfStock) {
    rows = rows.filter((row) => row.stock > 0)
  }
  if (options.limit && options.limit > 0) {
    rows = rows.slice(0, options.limit)
  }

  const { drafts } = mapTomketRowsToDrafts(rows, pricing)

  const preview = drafts.slice(0, 20).map((draft) => ({
    sku: draft.sku,
    handle: draft.handle,
    title: draft.title,
    producer: draft.producer,
    type: TOMKET_TIRE_TYPES[draft.tireType]?.label ?? draft.tireType,
    stock: draft.stock,
    priceHuf: draft.prices.huf,
    priceEur: draft.prices.eur,
    costEurNet: draft.prices.costEurNet,
  }))

  const finish = (
    partial: Pick<
      TomketImportResult,
      "created" | "updated" | "unchangedSkipped" | "failed"
    >
  ): TomketImportResult => {
    const finishedAt = new Date()
    return {
      dryRun: Boolean(options.dryRun),
      country,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      feed: { rows: feed.rows.length, unparseable: feed.skippedCount },
      eligible: drafts.length,
      preview,
      ...partial,
    }
  }

  if (options.dryRun) {
    report(`Száraz futtatás: ${drafts.length} termék jönne létre/frissülne.`)
    return finish({ created: 0, updated: 0, unchangedSkipped: 0, failed: [] })
  }

  const context = await resolveImportContext(container)
  report(
    `Cél: ${context.currencyCodes.join(", ")} árak, ${context.salesChannelIds.length} sales channel.`
  )
  if (!context.stockLocationId) {
    report(
      "Figyelem: nincs stock location a boltban, a készletszintek nem jönnek létre (minden tétel 0 készlettel jelenik meg)."
    )
  }

  const taxonomy = await ensureTaxonomy(container, drafts)
  const existing = await findExistingVariants(
    container,
    drafts.map((draft) => draft.sku)
  )

  const toCreate = drafts.filter((draft) => !existing.has(draft.sku))
  const toUpdate = drafts.filter((draft) => existing.has(draft.sku))

  report(`${toCreate.length} új termék, ${toUpdate.length} meglévő frissítése.`)

  const failed: TomketImportResult["failed"] = []
  let created = 0
  let updated = 0

  const batchSize = options.batchSize && options.batchSize > 0 ? options.batchSize : 25

  for (const [index, batch] of CHUNK(toCreate, batchSize).entries()) {
    try {
      const { result } = await createProductsWorkflow(container).run({
        input: {
          products: batch.map((draft) =>
            buildProductPayload(draft, context, taxonomy)
          ),
        },
      })
      created += result.length

      if (context.stockLocationId) {
        // Re-read the variants rather than trusting the workflow result to
        // carry inventory_items: without a stock level the tyre would sit at
        // zero and silently stay unbuyable.
        const persisted = await findExistingVariants(
          container,
          batch.map((draft) => draft.sku)
        )
        const entries = batch.flatMap((draft) => {
          const itemId = persisted.get(draft.sku)?.inventory_item_id
          return itemId ? [{ inventoryItemId: itemId, stock: draft.stock }] : []
        })

        if (entries.length < batch.length) {
          report(
            `Figyelem: ${batch.length - entries.length} új variánshoz nem jött létre inventory item, a készletük 0 marad.`
          )
        }

        await syncInventoryLevels(container, context.stockLocationId, entries)
      }

      report(
        `Létrehozva ${created}/${toCreate.length} (batch ${index + 1}).`
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      for (const draft of batch) {
        failed.push({ sku: draft.sku, reason })
      }
      report(`Batch ${index + 1} hiba: ${reason}`)
    }
  }

  for (const [index, batch] of CHUNK(toUpdate, batchSize).entries()) {
    try {
      await updateProductVariantsWorkflow(container).run({
        input: {
          product_variants: batch.map((draft) => {
            const variant = existing.get(draft.sku)!
            return {
              id: variant.id,
              weight: draft.weightGrams,
              metadata: draft.variantMetadata,
              prices: context.currencyCodes
                .map((currency) =>
                  currency === "huf"
                    ? { amount: draft.prices.huf, currency_code: "huf" }
                    : currency === "eur"
                      ? { amount: draft.prices.eur, currency_code: "eur" }
                      : null
                )
                .filter(
                  (price): price is { amount: number; currency_code: string } =>
                    Boolean(price)
                ),
            }
          }),
        },
      })
      updated += batch.length

      // Product-level fields too, so a better description template or a new
      // category reaches tyres imported earlier. Prices/stock are above.
      const productUpdates = batch.flatMap((draft) => {
        const productId = existing.get(draft.sku)?.product_id
        if (!productId) {
          return []
        }
        const payload = buildProductPayload(draft, context, taxonomy)
        return [
          {
            id: productId,
            title: payload.title,
            subtitle: payload.subtitle,
            description: payload.description,
            thumbnail: payload.thumbnail,
            type_id: payload.type_id,
            collection_id: payload.collection_id,
            category_ids: payload.category_ids,
            tag_ids: payload.tag_ids,
            metadata: payload.metadata,
          },
        ]
      })
      // One update per product even if two SKUs ever map to the same one.
      const uniqueProductUpdates = Array.from(
        new Map(productUpdates.map((update) => [update.id, update])).values()
      )
      if (uniqueProductUpdates.length) {
        await updateProductsWorkflow(container).run({
          input: { products: uniqueProductUpdates },
        })
      }

      if (context.stockLocationId) {
        const entries = batch.flatMap((draft) => {
          const itemId = existing.get(draft.sku)?.inventory_item_id
          return itemId ? [{ inventoryItemId: itemId, stock: draft.stock }] : []
        })
        await syncInventoryLevels(container, context.stockLocationId, entries)
      }

      report(`Frissítve ${updated}/${toUpdate.length} (batch ${index + 1}).`)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      for (const draft of batch) {
        failed.push({ sku: draft.sku, reason })
      }
      report(`Frissítési batch ${index + 1} hiba: ${reason}`)
    }
  }

  return finish({ created, updated, unchangedSkipped: 0, failed })
}

/**
 * Section 4.2 — the ten-minute stock and price file. Only touches variants we
 * already imported; it never creates products.
 */
export const runTomketStockSync = async (
  container: MedusaContainer,
  options: { onProgress?: (message: string) => void } = {}
) => {
  const report = options.onProgress ?? (() => {})
  const { config, missing } = resolveTomketConfig()
  const {
    config: pricing,
    missing: missingPricing,
    fx,
  } = await resolveTomketPricing(container)

  if (!config || !pricing) {
    throw new TomketImportConfigError([...missing, ...missingPricing])
  }

  report(describeFx(fx))

  const country = resolveTomketCountry()
  const feed = await fetchTomketStockFeed(config, country)
  report(`Készlet feed: ${feed.rows.length} tétel.`)

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "metadata", "inventory_items.inventory_item_id"],
    filters: { sku: feed.rows.map((row) => `TOMKET-${row.internalId}`) },
  })

  const byInternalId = new Map(
    (variants ?? []).flatMap((variant) => {
      const internalId = parseTomketSku(variant.sku)
      return internalId ? ([[internalId, variant]] as const) : []
    })
  )

  const context = await resolveImportContext(container)

  const priceUpdates: Array<{
    id: string
    prices: Array<{ amount: number; currency_code: string }>
  }> = []
  const stockEntries: Array<{ inventoryItemId: string; stock: number }> = []
  const inFeed = new Set<string>()

  for (const row of feed.rows) {
    const variant = byInternalId.get(row.internalId)
    if (!variant) {
      continue
    }

    inFeed.add(row.internalId)
    const prices = calculateTomketPrices(
      { priceEurNet: row.priceEurNet, shippingFeeEurNet: row.shippingFeeEurNet },
      pricing
    )

    priceUpdates.push({
      id: variant.id,
      prices: context.currencyCodes
        .map((currency) =>
          currency === "huf"
            ? { amount: prices.huf, currency_code: "huf" }
            : currency === "eur"
              ? { amount: prices.eur, currency_code: "eur" }
              : null
        )
        .filter(
          (price): price is { amount: number; currency_code: string } =>
            Boolean(price)
        ),
    })

    const itemId = (variant.inventory_items ?? [])[0]?.inventory_item_id
    if (itemId) {
      stockEntries.push({ inventoryItemId: itemId, stock: row.stock })
    }
  }

  // Section 4.2: the stock file lists only items in stock, so anything we
  // imported that is missing from it has run out at the supplier.
  for (const [internalId, variant] of byInternalId.entries()) {
    if (inFeed.has(internalId)) {
      continue
    }
    const itemId = (variant.inventory_items ?? [])[0]?.inventory_item_id
    if (itemId) {
      stockEntries.push({ inventoryItemId: itemId, stock: 0 })
    }
  }

  for (const batch of CHUNK(priceUpdates, 50)) {
    await updateProductVariantsWorkflow(container).run({
      input: { product_variants: batch },
    })
  }

  if (context.stockLocationId) {
    for (const batch of CHUNK(stockEntries, 100)) {
      await syncInventoryLevels(container, context.stockLocationId, batch)
    }
  }

  report(
    `Szinkron kész: ${priceUpdates.length} ár, ${stockEntries.length} készlet frissítve.`
  )

  return {
    matched: priceUpdates.length,
    stockUpdates: stockEntries.length,
    feedRows: feed.rows.length,
  }
}
