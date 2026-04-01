import { describe, expect, it, jest } from "@jest/globals"
import type {
  CreatePromotionDTO,
  PromotionDTO,
  Query,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

import { DiscountGeneratorService } from "../discount-generator"

const createScope = (query: Query) => {
  return {
    resolve: jest.fn((key: string) => {
      if (key === ContainerRegistrationKeys.QUERY) {
        return query
      }

      throw new Error(`Unexpected container token: ${String(key)}`)
    }),
  } as any
}

const templatePromotion = (
  code = "TEMPLATE_SPRING"
): PromotionDTO => ({
  id: "promo_template_01",
  code,
  type: "standard",
  status: "active",
  is_automatic: false,
  is_tax_inclusive: false,
  limit: 5,
  campaign_id: "camp_01",
  application_method: {
    id: "pmapp_01",
    type: "percentage",
    target_type: "items",
    allocation: "across",
    value: 12,
    currency_code: "eur",
    target_rules: [
      {
        id: "prule_target_01",
        attribute: "customer.group.id",
        operator: "in",
        values: [{ id: "prule_target_val_01", value: "cusgrp_01" }],
      },
    ],
    buy_rules: [],
  },
  rules: [
    {
      id: "prule_01",
      attribute: "region_id",
      operator: "in",
      values: [{ id: "prule_val_01", value: "reg_01" }],
    },
  ],
})

describe("discount-generator service", () => {
  it("clones a template promotion and creates a generated code", async () => {
    const graphMock = jest.fn(async ({ filters }: any) => {
      if (filters?.code === "TEMPLATE_SPRING") {
        return { data: [templatePromotion()] }
      }

      if (filters?.code === "SPRING-ABC123") {
        return { data: [] }
      }

      return { data: [] }
    })

    const query = { graph: graphMock } as unknown as Query
    const createPromotion = jest.fn(
      async (
        _scope: unknown,
        promotionData: CreatePromotionDTO
      ): Promise<PromotionDTO> => {
        return {
          id: "promo_new_01",
          code: promotionData.code,
          type: promotionData.type,
          status: promotionData.status,
          campaign_id: promotionData.campaign_id,
        }
      }
    )

    const service = new DiscountGeneratorService(createScope(query), {
      createPromotion,
      suffixFactory: () => "abc123",
    })

    const created = await service.generateDiscount("TEMPLATE_SPRING")

    expect(created.code).toBe("SPRING-ABC123")
    expect(createPromotion).toHaveBeenCalledTimes(1)

    const [, payload] = createPromotion.mock.calls[0] as [
      unknown,
      CreatePromotionDTO,
    ]

    expect(payload).toMatchObject({
      code: "SPRING-ABC123",
      type: "standard",
      status: "active",
      limit: 5,
      campaign_id: "camp_01",
      application_method: {
        type: "percentage",
        target_type: "items",
        allocation: "across",
        value: 12,
        currency_code: "eur",
      },
      rules: [
        {
          attribute: "region_id",
          operator: "in",
          values: ["reg_01"],
        },
      ],
    })
  })

  it("rejects source promotions that are not template-prefixed", async () => {
    const graphMock = jest.fn(async ({ filters }: any) => {
      if (filters?.code === "SPRING") {
        return { data: [templatePromotion("SPRING")] }
      }

      return { data: [] }
    })

    const query = { graph: graphMock } as unknown as Query

    const service = new DiscountGeneratorService(createScope(query), {
      suffixFactory: () => "ABC123",
    })

    await expect(service.generateDiscount("SPRING")).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
    })
  })

  it("returns not_found when template code does not exist", async () => {
    const graphMock = jest.fn(async () => ({ data: [] }))
    const query = { graph: graphMock } as unknown as Query

    const service = new DiscountGeneratorService(createScope(query))

    await expect(
      service.generateDiscount("TEMPLATE_MISSING")
    ).rejects.toMatchObject({
      type: MedusaError.Types.NOT_FOUND,
    })
  })

  it("fails with conflict after exhausting unique code retries", async () => {
    const graphMock = jest.fn(async ({ filters }: any) => {
      if (filters?.code === "TEMPLATE_FLASH") {
        return { data: [templatePromotion("TEMPLATE_FLASH")] }
      }

      return { data: [{ id: `promo_${filters?.code}` }] }
    })

    const query = { graph: graphMock } as unknown as Query
    const createPromotion = jest.fn()
    const suffixes = ["AAAAAA", "BBBBBB"]

    const service = new DiscountGeneratorService(createScope(query), {
      createPromotion,
      maxCodeAttempts: 2,
      suffixFactory: () => suffixes.shift() ?? "CCCCCC",
    })

    await expect(
      service.generateDiscount("TEMPLATE_FLASH")
    ).rejects.toMatchObject({
      type: MedusaError.Types.CONFLICT,
    })

    expect(createPromotion).not.toHaveBeenCalled()
  })
})

