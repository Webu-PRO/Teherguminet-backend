import { describe, expect, it } from "@jest/globals"

import ManualFulfillmentService from "../service"

describe("ManualFulfillmentService", () => {
  it("uses the approved 170 HUF/kg fallback tariff", async () => {
    const service = new ManualFulfillmentService()

    const result = await service.calculatePrice(
      {},
      { total_weight_kg: 2 },
      {}
    )

    expect(result.calculated_amount).toBe(340)
  })

  it("keeps an explicitly configured tariff authoritative", async () => {
    const service = new ManualFulfillmentService({}, { price_per_kg: 200 })

    const result = await service.calculatePrice(
      {},
      { total_weight_kg: 2 },
      {}
    )

    expect(result.calculated_amount).toBe(400)
  })
})
