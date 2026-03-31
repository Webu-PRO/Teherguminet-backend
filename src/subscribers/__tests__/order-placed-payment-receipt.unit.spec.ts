import { describe, expect, it, jest } from "@jest/globals"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import {
  findCapturedStripePaymentIdsForOrder,
  maybeSendPaymentReceiptsForPlacedOrder,
} from "../order-placed"

type QueryGraphFn = (input: unknown) => Promise<{ data: Array<unknown> }>

describe("order-placed payment receipt fallback", () => {
  it("retries payment lookup and returns captured Stripe payment ids", async () => {
    let attempt = 0
    const graph = jest.fn<QueryGraphFn>().mockImplementation(async () => {
      attempt += 1

      if (attempt === 1) {
        return { data: [] }
      }

      return {
        data: [
          {
            id: "pay_stripe_captured",
            provider_id: "pp_stripe_stripe",
            captured_at: "2026-03-31T16:58:01.000Z",
          },
          {
            id: "pay_manual_captured",
            provider_id: "pp_manual_manual",
            captured_at: "2026-03-31T16:58:01.000Z",
          },
          {
            id: "pay_stripe_not_captured",
            provider_id: "pp_stripe_stripe",
            captured_at: null,
          },
        ],
      }
    })

    const container = {
      resolve: jest.fn((token: unknown) => {
        if (token === ContainerRegistrationKeys.QUERY) {
          return { graph }
        }

        throw new Error(`Unexpected resolve token: ${String(token)}`)
      }),
    }

    const paymentIds = await findCapturedStripePaymentIdsForOrder(
      container as any,
      "order_79",
      {
        maxAttempts: 2,
        retryDelayMs: 0,
        retryBackoffMs: 0,
      }
    )

    expect(paymentIds).toEqual(["pay_stripe_captured"])
    expect(graph).toHaveBeenCalledTimes(2)
  })

  it("sends receipts for resolved payments and continues on one failure", async () => {
    const graph = jest.fn<QueryGraphFn>().mockResolvedValue({
      data: [
        {
          id: "pay_ok",
          provider_id: "pp_stripe_stripe",
          captured_at: "2026-03-31T16:58:01.000Z",
        },
        {
          id: "pay_fail",
          provider_id: "pp_stripe_stripe",
          captured_at: "2026-03-31T16:58:02.000Z",
        },
      ],
    })

    const container = {
      resolve: jest.fn((token: unknown) => {
        if (token === ContainerRegistrationKeys.QUERY) {
          return { graph }
        }

        throw new Error(`Unexpected resolve token: ${String(token)}`)
      }),
    }

    const logger = {
      warn: jest.fn(),
      error: jest.fn(),
    }

    const runner = jest
      .fn<(paymentId: string) => Promise<void>>()
      .mockImplementation(async (paymentId) => {
        if (paymentId === "pay_fail") {
          throw new Error("Simulated send failure")
        }
      })

    await maybeSendPaymentReceiptsForPlacedOrder(
      container as any,
      "order_79",
      logger as any,
      {
        maxAttempts: 1,
        retryDelayMs: 0,
        retryBackoffMs: 0,
      },
      runner
    )

    expect(runner).toHaveBeenCalledTimes(2)
    expect(runner).toHaveBeenNthCalledWith(1, "pay_ok")
    expect(runner).toHaveBeenNthCalledWith(2, "pay_fail")
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it("does nothing when no captured Stripe payments are found", async () => {
    const graph = jest.fn<QueryGraphFn>().mockResolvedValue({
      data: [
        {
          id: "pay_manual",
          provider_id: "pp_manual_manual",
          captured_at: "2026-03-31T16:58:01.000Z",
        },
      ],
    })

    const container = {
      resolve: jest.fn((token: unknown) => {
        if (token === ContainerRegistrationKeys.QUERY) {
          return { graph }
        }

        throw new Error(`Unexpected resolve token: ${String(token)}`)
      }),
    }

    const runner = jest.fn<(paymentId: string) => Promise<void>>()

    await maybeSendPaymentReceiptsForPlacedOrder(
      container as any,
      "order_79",
      undefined,
      {
        maxAttempts: 1,
        retryDelayMs: 0,
        retryBackoffMs: 0,
      },
      runner
    )

    expect(runner).not.toHaveBeenCalled()
  })
})
