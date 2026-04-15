import type { ExecArgs, Logger } from "@medusajs/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type QueryService = {
  graph: <T = Record<string, unknown>>(
    queryConfig: Record<string, unknown>
  ) => Promise<{
    data: T[]
    metadata?: { count?: number }
  }>
}

type QueryInventoryItem = {
  id: string
  sku?: string | null
  weight?: number | null
  width?: number | null
  height?: number | null
}

type QueryProductVariant = {
  id: string
  title?: string | null
  sku?: string | null
  weight?: number | null
  width?: number | null
  height?: number | null
}

type QueryProduct = {
  id: string
  title?: string | null
  variants?: QueryProductVariant[] | null
}

type ProductModuleService = {
  updateProductVariants: (
    id: string,
    data: {
      weight?: number
      width?: number
      height?: number
    }
  ) => Promise<unknown>
}

type DimensionField = "weight" | "width" | "height"

const DIMENSION_FIELDS: DimensionField[] = ["weight", "width", "height"]

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return ""
  }

  return value.trim()
}

const normalizeNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

const isMissingDimension = (value: unknown) => {
  const normalized = normalizeNumber(value)
  return normalized === null || normalized <= 0
}

const isDefaultVariant = (variant: QueryProductVariant, variantCount: number) => {
  if (variantCount === 1) {
    return true
  }

  const normalizedTitle = normalizeText(variant.title).toLowerCase()
  return normalizedTitle === "default variant"
}

const readArgsSet = (args: unknown) => {
  if (!Array.isArray(args)) {
    return new Set<string>()
  }

  return new Set(
    args
      .map((arg) => normalizeText(arg))
      .filter((arg) => arg.length > 0)
      .map((arg) => arg.toLowerCase())
  )
}

export default async function backfillDefaultVariantDimensions({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve<QueryService>(ContainerRegistrationKeys.QUERY)
  const productService = container.resolve<ProductModuleService>("product")

  const argsSet = readArgsSet(args)
  const apply = argsSet.has("--apply")
  const dryRun = !apply

  const inventoryBySku = new Map<string, QueryInventoryItem>()
  const inventoryLimit = 250
  let inventoryOffset = 0
  let inventoryCount = 0

  do {
    const { data, metadata } = await query.graph<QueryInventoryItem>({
      entity: "inventory_item",
      fields: ["id", "sku", "weight", "width", "height"],
      pagination: {
        take: inventoryLimit,
        skip: inventoryOffset,
      },
    })

    inventoryCount = metadata?.count ?? 0
    inventoryOffset += inventoryLimit

    for (const item of data) {
      const skuKey = normalizeText(item.sku).toLowerCase()
      if (!skuKey || inventoryBySku.has(skuKey)) {
        continue
      }

      inventoryBySku.set(skuKey, item)
    }
  } while (inventoryCount > inventoryOffset)

  const productLimit = 100
  let productOffset = 0
  let productCount = 0

  let scannedProducts = 0
  let scannedVariants = 0
  let defaultVariants = 0
  let missingAnyDimension = 0
  let patchableVariants = 0
  let patchedVariants = 0
  let skippedNoSku = 0
  let skippedNoInventoryMatch = 0

  logger.info(
    `${dryRun ? "[dry-run] " : ""}Backfilling default variant dimensions (weight/width/height) from inventory items by SKU...`
  )

  do {
    const { data: products, metadata } = await query.graph<QueryProduct>({
      entity: "product",
      fields: [
        "id",
        "title",
        "variants.id",
        "variants.title",
        "variants.sku",
        "variants.weight",
        "variants.width",
        "variants.height",
      ],
      pagination: {
        take: productLimit,
        skip: productOffset,
      },
    })

    productCount = metadata?.count ?? 0
    productOffset += productLimit
    scannedProducts += products.length

    for (const product of products) {
      const variants = Array.isArray(product.variants) ? product.variants : []
      scannedVariants += variants.length

      for (const variant of variants) {
        if (!variant?.id || !isDefaultVariant(variant, variants.length)) {
          continue
        }

        defaultVariants += 1

        const hasMissingDimension = DIMENSION_FIELDS.some((field) =>
          isMissingDimension(variant[field])
        )

        if (!hasMissingDimension) {
          continue
        }

        missingAnyDimension += 1

        const skuKey = normalizeText(variant.sku).toLowerCase()
        if (!skuKey) {
          skippedNoSku += 1
          continue
        }

        const inventoryItem = inventoryBySku.get(skuKey)
        if (!inventoryItem) {
          skippedNoInventoryMatch += 1
          continue
        }

        const patch: {
          weight?: number
          width?: number
          height?: number
        } = {}

        for (const field of DIMENSION_FIELDS) {
          if (!isMissingDimension(variant[field])) {
            continue
          }

          const sourceValue = normalizeNumber(inventoryItem[field])
          if (sourceValue === null || sourceValue <= 0) {
            continue
          }

          patch[field] = sourceValue
        }

        if (!Object.keys(patch).length) {
          continue
        }

        patchableVariants += 1

        if (apply) {
          await productService.updateProductVariants(variant.id, patch)
        }

        patchedVariants += 1
      }
    }
  } while (productCount > productOffset)

  logger.info(
    `${dryRun ? "[dry-run] " : ""}Default variant dimension backfill finished: scanned_products=${scannedProducts}, scanned_variants=${scannedVariants}, default_variants=${defaultVariants}, missing_any_dimension=${missingAnyDimension}, patchable=${patchableVariants}, ${dryRun ? "would_update" : "updated"}=${patchedVariants}, skipped_no_sku=${skippedNoSku}, skipped_no_inventory_match=${skippedNoInventoryMatch}`
  )

  if (dryRun) {
    logger.info(
      "Dry-run only. Re-run with '--apply' to write updates: npx medusa exec ./src/scripts/backfill-default-variant-dimensions.ts --apply"
    )
  }
}

