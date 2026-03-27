import { describe, expect, it, jest } from "@jest/globals"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import pickupFulfillmentCreatedHandler from "../pickup-fulfillment-created"

type QueryGraphFn = (input: unknown) => Promise<{ data: Array<unknown> }>
type CreateNotificationsFn = (payloads: any[]) => Promise<any[]>
type UpdateFulfillmentFn = (
  fulfillmentId: string,
  payload: unknown
) => Promise<void>
type UpdateOrdersFn = (orderId: string, payload: unknown) => Promise<void>

describe("pickup-fulfillment-created subscriber", () => {
  it("sends pickup-ready email when fulfillment shipping option is pickup even if order methods are stale", async () => {
    const graph = jest
      .fn<QueryGraphFn>()
      .mockImplementation(async (input: any) => {
        if (input?.entity === "fulfillment") {
          return {
            data: [
              {
                id: "ful_60",
                created_at: "2026-03-27T12:00:00.000Z",
                metadata: {},
                shipping_option_id: "so_pickup_admin",
                order: {
                  id: "order_60",
                  display_id: 60,
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
                      id: "sm_old",
                      shipping_option_id: "so_gls_old",
                      name: "GLS házhozszállítás",
                      provider_id: "gls",
                      metadata: {},
                    },
                  ],
                },
              },
            ],
          }
        }

        if (input?.entity === "shipping_option") {
          return {
            data: [
              {
                id: "so_pickup_admin",
                name: "Helyszíni átvétel",
                provider_id: "manual",
                data: {},
                metadata: {},
              },
            ],
          }
        }

        return { data: [] }
      })

    const createNotifications = jest
      .fn<CreateNotificationsFn>()
      .mockImplementation(async (payloads) => payloads)
    const updateFulfillment = jest
      .fn<UpdateFulfillmentFn>()
      .mockResolvedValue(undefined)
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

        if (token === Modules.FULFILLMENT) {
          return { updateFulfillment }
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

    await pickupFulfillmentCreatedHandler({
      event: {
        name: "order.fulfillment_created",
        data: {
          id: "ful_60",
        },
      },
      container: container as any,
    } as any)

    expect(createNotifications).toHaveBeenCalledTimes(1)
    expect(createNotifications.mock.calls[0][0][0].template).toBe(
      "order-pickup-ready"
    )
    expect(updateFulfillment).toHaveBeenCalledWith(
      "ful_60",
      expect.objectContaining({
        metadata: expect.objectContaining({
          pickup_ready_email_sent_at: expect.any(String),
        }),
      })
    )
    expect(updateOrders).toHaveBeenCalledWith(
      "order_60",
      expect.objectContaining({
        metadata: expect.objectContaining({
          pickup_ready_active: true,
          pickup_ready_last_fulfillment_id: "ful_60",
          pickup_ready_last_sent_at: expect.any(String),
        }),
      })
    )
  })
})
