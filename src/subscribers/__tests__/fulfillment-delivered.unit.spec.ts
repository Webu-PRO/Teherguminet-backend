import { describe, expect, it, jest } from "@jest/globals"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import fulfillmentDeliveredHandler from "../fulfillment-delivered"

type QueryGraphFn = (input: unknown) => Promise<{ data: Array<unknown> }>
type CreateNotificationsFn = (payloads: any[]) => Promise<any[]>
type UpdateFulfillmentFn = (
  fulfillmentId: string,
  payload: unknown
) => Promise<void>

describe("fulfillment-delivered subscriber", () => {
  it("sends pickup completed email when pickup fulfillment is marked delivered", async () => {
    const graph = jest.fn<QueryGraphFn>().mockResolvedValue({
      data: [
        {
          id: "ful_pickup_1",
          delivered_at: "2026-03-27T15:39:00.000Z",
          metadata: {},
          shipping_option_id: "so_pickup",
          shipping_option: {
            name: "Helyszíni átvétel",
            type: {
              code: "pickup",
              label: "Személyes átvétel",
              description: "Helyszíni átvétel",
            },
          },
          order: {
            id: "order_pickup_1",
            display_id: 601,
            email: "customer@example.com",
            currency_code: "huf",
            metadata: {
              language: "hu",
            },
            total: 10000,
            subtotal: 10000,
            shipping_total: 0,
            item_total: 10000,
            items: [],
            shipping_address: {
              country_code: "hu",
            },
            billing_address: {
              country_code: "hu",
            },
            customer: {},
            shipping_methods: [
              {
                id: "sm_pickup",
                shipping_option_id: "so_pickup",
                provider_id: "manual",
                name: "Helyszíni átvétel",
                metadata: {},
              },
            ],
          },
        },
      ],
    })

    const createNotifications = jest
      .fn<CreateNotificationsFn>()
      .mockImplementation(async (payloads) => payloads)
    const updateFulfillment = jest
      .fn<UpdateFulfillmentFn>()
      .mockResolvedValue(undefined)
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

        if (token === Modules.FULFILLMENT) {
          return { updateFulfillment }
        }

        if (token === ContainerRegistrationKeys.LOGGER) {
          return logger
        }

        throw new Error(`Unexpected resolve token: ${String(token)}`)
      }),
    }

    await fulfillmentDeliveredHandler({
      event: {
        name: "fulfillment.updated",
        data: {
          id: "ful_pickup_1",
        },
      },
      container: container as any,
    } as any)

    expect(createNotifications).toHaveBeenCalledTimes(1)
    expect(createNotifications.mock.calls[0][0][0].template).toBe(
      "order-pickup-completed"
    )
    expect(updateFulfillment).toHaveBeenCalledWith(
      "ful_pickup_1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          pickup_completed_email_sent_at: expect.any(String),
        }),
      })
    )
  })
})

