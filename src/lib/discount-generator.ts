import { randomInt } from "crypto"

import { createPromotionsWorkflow } from "@medusajs/core-flows"
import type { MedusaRequest } from "@medusajs/framework/http"
import type {
  ApplicationMethodDTO,
  CreateApplicationMethodDTO,
  CreatePromotionDTO,
  CreatePromotionRuleDTO,
  PromotionDTO,
  PromotionRuleDTO,
  Query,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

export const DISCOUNT_TEMPLATE_PREFIX = "TEMPLATE_"
const CODE_SUFFIX_LENGTH = 6
const DEFAULT_MAX_CODE_ATTEMPTS = 8
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

const PROMOTION_CLONE_FIELDS = [
  "id",
  "code",
  "type",
  "status",
  "is_automatic",
  "is_tax_inclusive",
  "limit",
  "campaign_id",
  "*application_method",
  "*application_method.buy_rules",
  "application_method.buy_rules.values.value",
  "*application_method.target_rules",
  "application_method.target_rules.values.value",
  "rules.id",
  "rules.attribute",
  "rules.operator",
  "rules.values.value",
]

type DiscountGeneratorDeps = {
  createPromotion?: (
    scope: MedusaRequest["scope"],
    promotionData: CreatePromotionDTO
  ) => Promise<PromotionDTO>
  suffixFactory?: () => string
  maxCodeAttempts?: number
}

const defaultCreatePromotion = async (
  scope: MedusaRequest["scope"],
  promotionData: CreatePromotionDTO
) => {
  const { result } = await createPromotionsWorkflow(scope).run({
    input: {
      promotionsData: [promotionData],
    },
  })

  const [promotion] = result
  return promotion
}

const toCreateRule = (
  rule: PromotionRuleDTO,
  pathLabel: string
): CreatePromotionRuleDTO => {
  if (!rule.attribute || !rule.operator) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Template promotion is missing required ${pathLabel} rule attributes.`
    )
  }

  const values = (rule.values ?? [])
    .map((value) => value?.value)
    .filter((value): value is string => {
      return typeof value === "string" && value.trim().length > 0
    })

  if (!values.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Template promotion has an empty ${pathLabel} rule value set.`
    )
  }

  return {
    attribute: rule.attribute,
    operator: rule.operator,
    values,
  }
}

const toCreateApplicationMethod = (
  applicationMethod?: ApplicationMethodDTO
): CreateApplicationMethodDTO => {
  if (!applicationMethod?.type || !applicationMethod.target_type) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Template promotion is missing a valid application method."
    )
  }

  const payload: CreateApplicationMethodDTO = {
    type: applicationMethod.type,
    target_type: applicationMethod.target_type,
  }

  if (applicationMethod.allocation) {
    payload.allocation = applicationMethod.allocation
  }

  if (applicationMethod.value !== undefined) {
    payload.value = applicationMethod.value
  }

  if (applicationMethod.currency_code) {
    payload.currency_code = applicationMethod.currency_code
  }

  if (applicationMethod.max_quantity !== undefined) {
    payload.max_quantity = applicationMethod.max_quantity
  }

  if (applicationMethod.buy_rules_min_quantity !== undefined) {
    payload.buy_rules_min_quantity = applicationMethod.buy_rules_min_quantity
  }

  if (applicationMethod.apply_to_quantity !== undefined) {
    payload.apply_to_quantity = applicationMethod.apply_to_quantity
  }

  const targetRules = (applicationMethod.target_rules ?? []).map((rule) =>
    toCreateRule(rule, "application method target")
  )
  if (targetRules.length) {
    payload.target_rules = targetRules
  }

  const buyRules = (applicationMethod.buy_rules ?? []).map((rule) =>
    toCreateRule(rule, "application method buy")
  )
  if (buyRules.length) {
    payload.buy_rules = buyRules
  }

  return payload
}

const toCreatePromotion = (
  sourcePromotion: PromotionDTO,
  generatedCode: string
): CreatePromotionDTO => {
  if (!sourcePromotion.type) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Template promotion type is missing."
    )
  }

  const promotionData: CreatePromotionDTO = {
    code: generatedCode,
    type: sourcePromotion.type,
    status: sourcePromotion.status ?? "draft",
    application_method: toCreateApplicationMethod(
      sourcePromotion.application_method
    ),
  }

  if (sourcePromotion.is_automatic !== undefined) {
    promotionData.is_automatic = sourcePromotion.is_automatic
  }

  if (sourcePromotion.is_tax_inclusive !== undefined) {
    promotionData.is_tax_inclusive = sourcePromotion.is_tax_inclusive
  }

  if (sourcePromotion.limit !== undefined) {
    promotionData.limit = sourcePromotion.limit
  }

  if (sourcePromotion.campaign_id) {
    promotionData.campaign_id = sourcePromotion.campaign_id
  }

  const rules = (sourcePromotion.rules ?? []).map((rule) =>
    toCreateRule(rule, "promotion")
  )

  if (rules.length) {
    promotionData.rules = rules
  }

  return promotionData
}

const isTemplateCode = (code?: string | null) => {
  if (!code) {
    return false
  }

  return code.trim().toUpperCase().startsWith(DISCOUNT_TEMPLATE_PREFIX)
}

const buildCodeBase = (templateCode: string) => {
  const normalized = templateCode.trim().toUpperCase()

  if (!normalized.startsWith(DISCOUNT_TEMPLATE_PREFIX)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Template code must start with ${DISCOUNT_TEMPLATE_PREFIX}.`
    )
  }

  const rawBase = normalized
    .slice(DISCOUNT_TEMPLATE_PREFIX.length)
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")

  return rawBase || "DISCOUNT"
}

const createRandomSuffix = () => {
  const chars: string[] = []
  for (let i = 0; i < CODE_SUFFIX_LENGTH; i += 1) {
    const index = randomInt(0, CODE_ALPHABET.length)
    chars.push(CODE_ALPHABET[index]!)
  }
  return chars.join("")
}

export class DiscountGeneratorService {
  private readonly createPromotion: (
    scope: MedusaRequest["scope"],
    promotionData: CreatePromotionDTO
  ) => Promise<PromotionDTO>

  private readonly suffixFactory: () => string
  private readonly maxCodeAttempts: number

  constructor(
    private readonly scope: MedusaRequest["scope"],
    deps: DiscountGeneratorDeps = {}
  ) {
    this.createPromotion = deps.createPromotion ?? defaultCreatePromotion
    this.suffixFactory = deps.suffixFactory ?? createRandomSuffix
    this.maxCodeAttempts = deps.maxCodeAttempts ?? DEFAULT_MAX_CODE_ATTEMPTS
  }

  private resolveQuery() {
    return this.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
  }

  private async getPromotionByCode(code: string) {
    const query = this.resolveQuery()
    const { data } = await query.graph({
      entity: "promotion",
      fields: PROMOTION_CLONE_FIELDS,
      filters: { code },
    })

    return (data?.[0] ?? null) as PromotionDTO | null
  }

  private async isPromotionCodeUsed(code: string) {
    const query = this.resolveQuery()
    const { data } = await query.graph({
      entity: "promotion",
      fields: ["id"],
      filters: { code },
    })

    return Boolean(data?.length)
  }

  async generateDiscount(templateCodeInput: string) {
    const templateCode = templateCodeInput?.trim()

    if (!templateCode) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Template discount code is required."
      )
    }

    const sourcePromotion = await this.getPromotionByCode(templateCode)

    if (!sourcePromotion) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Template promotion not found for code: ${templateCode}`
      )
    }

    if (!isTemplateCode(sourcePromotion.code)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Promotion code ${templateCode} is not a template.`
      )
    }

    const codeBase = buildCodeBase(sourcePromotion.code!)

    for (let attempt = 0; attempt < this.maxCodeAttempts; attempt += 1) {
      const suffix = this.suffixFactory()
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "")

      if (!suffix) {
        continue
      }

      const generatedCode = `${codeBase}-${suffix}`

      const exists = await this.isPromotionCodeUsed(generatedCode)
      if (exists) {
        continue
      }

      const promotionData = toCreatePromotion(sourcePromotion, generatedCode)
      return await this.createPromotion(this.scope, promotionData)
    }

    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Unable to generate a unique discount code. Please try again."
    )
  }
}
