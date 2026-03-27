import { describe, expect, it, jest } from "@jest/globals"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import pickupFulfillmentCancelledHandler from "../pickup-fulfillment-cancelled"

type QueryGraphFn = (input: unknown) => Promise<{ data: Array<unknown> }>
type CreateNotificationsFn = (payloads: any[]) => Promise<any[]>
type UpdateOrdersFn = (orderId: string, payload: unknown) => Promise<void>

describe("pickup-fulfillment-cancelled subscriber", () => {
  it("sends cancellation email when pickup-ready order returns to not_fulfilled", async () => {
    const graph = jest.fn<QueryGraphFn>().mockResolvedValue({
      data: [
        {
          id: "order_60",
          display_id: 60,
          email: "customer@example.com",
          currency_code: "huf",
          fulfillment_status: "not_fulfilled",
          metadata: {
            language: "hu",
            pickup_ready_active: true,
            pickup_ready_last_fulfillment_id: "ful_60",
          },
          shipping_methods: [
            {
              id: "sm_pickup",
              shipping_option_id: "so_pickup",
              provider_id: "manual",
              name: "Helyszíni átvétel",
              metadata: {},
            },
          ],
          shipping_address: { country_code: "hu" },
          billing_address: { country_code: "hu" },
          customer: {},
          total: 10000,
          subtotal: 10000,
          shipping_total: 0,
          item_total: 10000,
          items: [],
        },
      ],
    })

    const createNotifications = jest
      .fn<CreateNotificationsFn>()
      .mockImplementation(async (payloads) => payloads)
    const updateOrders = jest.fn<UpdateOrdersFn>().mockResolvedValue(undefined)
    const logger = {
      warn: jest.fn(),
      error: jest.fn(),
    }

    const container = {
      resolve: jest.fn((token: unknown) => {
        if (token === ContainerRegistrationKeys.QUERY) {
          return { graph }
        }

        if (token === Modules.NOTIFICATION) {
          return { createNotifications }
        }

        if (token === Modules.ORDER) {
          return { updateOrders }
        }

        if (token === ContainerRegistrationKeys.LOGGER) {
          return logger
        }

        throw new Error(`Unexpected resolve token: ${String(token)}`)
      }),
    }

    await pickupFulfillmentCancelledHandler({
      event: {
        name: "order.updated",
        data: {
          id: "order_60",
        },
      },
      container: container as any,
    } as any)

    expect(createNotifications).toHaveBeenCalledTimes(1)
    expect(createNotifications.mock.calls[0][0][0].template).toBe(
      "order-pickup-cancelled"
    )
    expect(updateOrders).toHaveBeenCalledWith(
      "order_60",
      expect.objectContaining({
        metadata: expect.objectContaining({
          pickup_ready_active: false,
          pickup_cancelled_email_sent_at: expect.any(String),
          pickup_cancelled_last_fulfillment_id: "ful_60",
        }),
      })
    )
  })
})
