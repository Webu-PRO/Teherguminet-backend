import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { QueryGraphFunction } from "@medusajs/types"

import type { AdminUpdateProductLocalizationType } from "../../localization/middlewares"
import {
  extractLocalizationFromMetadata,
  getEmptyProductLocalizationValues,
  normalizeProductLocalizationValues,
  normalizeText,
  type ProductLocalizationValues,
} from "../../../../../lib/product-localization"
import { PRODUCT_LOCALIZATION_MODULE } from "../../../../../modules/product-localization"

type ProductProjection = {
  id: string
  title?: unknown
  description?: unknown
  metadata?: Record<string, unknown> | null
}

type ProductLocalizationRecord = {
  id: string
  product_id: string
  title_hu?: string | null
  title_sk?: string | null
  description_hu?: string | null
  description_sk?: string | null
}

type ProductLocalizationModuleService = {
  listProductLocalizations: (
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<ProductLocalizationRecord[]>
  createProductLocalizations: (
    data: Array<Record<string, unknown>>
  ) => Promise<ProductLocalizationRecord[]>
  updateProductLocalizations: (
    data: Array<Record<string, unknown>>
  ) => Promise<ProductLocalizationRecord[]>
}

type QueryService = {
  graph: QueryGraphFunction
}

type FieldSource = "db" | "metadata" | "default" | "empty"

type LocalizationView = {
  values: ProductLocalizationValues
  sources: Record<keyof ProductLocalizationValues, FieldSource>
  defaults: {
    title: string
    description: string
  }
}

const FIELD_KEYS: Array<keyof ProductLocalizationValues> = [
  "title_hu",
  "title_sk",
  "description_hu",
  "description_sk",
]

const resolveProduct = async (
  req: MedusaRequest,
  productId: string
): Promise<ProductProjection> => {
  const query = req.scope.resolve("query") as QueryService

  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "description", "metadata"],
    filters: {
      id: productId,
    },
    pagination: {
      take: 1,
      skip: 0,
    },
  })

  const product = data[0]
  if (!product?.id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found.")
  }

  return product
}

const resolveExistingLocalization = async (
  service: ProductLocalizationModuleService,
  productId: string
) => {
  const rows = await service.listProductLocalizations(
    {
      product_id: productId,
    },
    {
      take: 1,
    }
  )

  return rows[0] ?? null
}

const toNullableDbPayload = (values: ProductLocalizationValues) => ({
  title_hu: values.title_hu || null,
  title_sk: values.title_sk || null,
  description_hu: values.description_hu || null,
  description_sk: values.description_sk || null,
})

const hasAnyLocalizationValue = (values: ProductLocalizationValues) =>
  FIELD_KEYS.some((key) => values[key].length > 0)

const buildLocalizationView = (
  product: ProductProjection,
  row: ProductLocalizationRecord | null
): LocalizationView => {
  const fromDb = normalizeProductLocalizationValues(
    row
      ? {
          title_hu: row.title_hu ?? "",
          title_sk: row.title_sk ?? "",
          description_hu: row.description_hu ?? "",
          description_sk: row.description_sk ?? "",
        }
      : null
  )

  const fromMetadata = extractLocalizationFromMetadata(product.metadata)
  const defaults = {
    title: normalizeText(product.title),
    description: normalizeText(product.description),
  }

  const values = getEmptyProductLocalizationValues()
  const sources = {
    title_hu: "empty" as FieldSource,
    title_sk: "empty" as FieldSource,
    description_hu: "empty" as FieldSource,
    description_sk: "empty" as FieldSource,
  }

  values.title_hu = fromDb.title_hu
  if (values.title_hu) {
    sources.title_hu = "db"
  } else if (fromMetadata.title_hu) {
    values.title_hu = fromMetadata.title_hu
    sources.title_hu = "metadata"
  } else if (defaults.title) {
    values.title_hu = defaults.title
    sources.title_hu = "default"
  }

  values.title_sk = fromDb.title_sk
  if (values.title_sk) {
    sources.title_sk = "db"
  } else if (fromMetadata.title_sk) {
    values.title_sk = fromMetadata.title_sk
    sources.title_sk = "metadata"
  }

  values.description_hu = fromDb.description_hu
  if (values.description_hu) {
    sources.description_hu = "db"
  } else if (fromMetadata.description_hu) {
    values.description_hu = fromMetadata.description_hu
    sources.description_hu = "metadata"
  } else if (defaults.description) {
    values.description_hu = defaults.description
    sources.description_hu = "default"
  }

  values.description_sk = fromDb.description_sk
  if (values.description_sk) {
    sources.description_sk = "db"
  } else if (fromMetadata.description_sk) {
    values.description_sk = fromMetadata.description_sk
    sources.description_sk = "metadata"
  }

  return {
    values,
    sources,
    defaults,
  }
}

const parseProductId = (req: MedusaRequest) => {
  const productId = normalizeText(req.params?.id)
  if (!productId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Product ID is required."
    )
  }

  return productId
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = parseProductId(req)
  const service = req.scope.resolve(
    PRODUCT_LOCALIZATION_MODULE
  ) as ProductLocalizationModuleService

  const product = await resolveProduct(req, productId)
  const existingRow = await resolveExistingLocalization(service, productId)
  const view = buildLocalizationView(product, existingRow)

  res.status(200).json({
    ok: true,
    product_id: product.id,
    values: view.values,
    sources: view.sources,
    defaults: view.defaults,
  })
}

export async function PATCH(
  req: MedusaRequest<AdminUpdateProductLocalizationType>,
  res: MedusaResponse
) {
  const productId = parseProductId(req)
  const service = req.scope.resolve(
    PRODUCT_LOCALIZATION_MODULE
  ) as ProductLocalizationModuleService

  const product = await resolveProduct(req, productId)
  const existingRow = await resolveExistingLocalization(service, productId)

  const currentValues = normalizeProductLocalizationValues(
    existingRow
      ? {
          title_hu: existingRow.title_hu ?? "",
          title_sk: existingRow.title_sk ?? "",
          description_hu: existingRow.description_hu ?? "",
          description_sk: existingRow.description_sk ?? "",
        }
      : null
  )

  const nextValues = { ...currentValues }
  for (const key of FIELD_KEYS) {
    if (!(key in req.validatedBody)) {
      continue
    }

    nextValues[key] = normalizeText(req.validatedBody[key])
  }

  let nextRow = existingRow
  if (existingRow) {
    const [updated] = await service.updateProductLocalizations([
      {
        id: existingRow.id,
        ...toNullableDbPayload(nextValues),
      },
    ])

    nextRow = updated ?? existingRow
  } else if (hasAnyLocalizationValue(nextValues)) {
    const [created] = await service.createProductLocalizations([
      {
        product_id: productId,
        ...toNullableDbPayload(nextValues),
      },
    ])

    nextRow = created ?? null
  }

  const view = buildLocalizationView(product, nextRow)

  res.status(200).json({
    ok: true,
    product_id: product.id,
    values: view.values,
    sources: view.sources,
    defaults: view.defaults,
  })
}
