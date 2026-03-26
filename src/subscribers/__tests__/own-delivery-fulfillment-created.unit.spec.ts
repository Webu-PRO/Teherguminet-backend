import { describe, expect, it, jest } from "@jest/globals"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import ownDeliveryFulfillmentCreatedHandler from "../own-delivery-fulfillment-created"

type NotificationPayload = {
  template?: string
  idempotency_key?: string
}

type QueryGraphFn = (input: unknown) => Promise<{ data: Array<unknown> }>
type CreateNotificationsFn = (
  payloads: NotificationPayload[]
) => Promise<NotificationPayload[]>
type UpdateFulfillmentFn = (
  fulfillmentId: string,
  payload: unknown
) => Promise<void>

describe("own-delivery-fulfillment-created subscriber", () => {
  it("sends both prepared and on-the-way emails for own delivery fulfillment creation", async () => {
    const graph = jest.fn<QueryGraphFn>().mockResolvedValue({
      data: [
        {
          id: "ful_1",
          metadata: {},
          shipping_option_id: "so_1",
          order: {
            id: "order_1",
            display_id: 123,
            email: "customer@teherguminet.hu",
            currency_code: "huf",
            metadata: {
              language: "hu",
            },
            total: 20000,
            subtotal: 20000,
            shipping_total: 0,
            item_total: 20000,
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
                id: "sm_1",
                shipping_option_id: "so_1",
                provider_id: "manual_teherguminet",
                name: "Saját szállítás (2-6 munkanap)",
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

    await ownDeliveryFulfillmentCreatedHandler({
      event: {
        name: "order.fulfillment_created",
        data: {
          id: "ful_1",
        },
      },
      container: container as any,
    } as any)

    expect(createNotifications).toHaveBeenCalledTimes(2)
    const sentTemplates = createNotifications.mock.calls.map(
      ([payloads]) => payloads[0].template
    )
    expect(sentTemplates).toEqual([
      "own-delivery-fulfillment-created",
      "own-delivery-shipped",
    ])
    const sentIdempotencyKeys = createNotifications.mock.calls.map(
      ([payloads]) => payloads[0].idempotency_key
    )
    expect(sentIdempotencyKeys).toEqual([
      "own-delivery-fulfillment-created-ful_1",
      "own-delivery-shipped-ful_1",
    ])

    expect(updateFulfillment).toHaveBeenCalledWith(
      "ful_1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          own_delivery_fulfillment_created_email_sent_at: expect.any(String),
          own_delivery_shipped_email_sent_at: expect.any(String),
        }),
      })
    )
  })

  it("sends emails again for replacement fulfillment when copied sent metadata is older than fulfillment creation", async () => {
    const graph = jest.fn<QueryGraphFn>().mockResolvedValue({
      data: [
        {
          id: "ful_2",
          created_at: "2026-03-26T12:00:00.000Z",
          metadata: {
            own_delivery_fulfillment_created_email_sent_at:
              "2026-03-26T09:00:00.000Z",
          },
          shipping_option_id: "so_1",
          order: {
            id: "order_2",
            display_id: 124,
            email: "customer@teherguminet.hu",
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
                id: "sm_2",
                shipping_option_id: "so_1",
                provider_id: "manual_teherguminet",
                name: "Saját szállítás",
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

    await ownDeliveryFulfillmentCreatedHandler({
      event: {
        name: "order.fulfillment_created",
        data: {
          id: "ful_2",
        },
      },
      container: container as any,
    } as any)

    expect(createNotifications).toHaveBeenCalledTimes(2)
    expect(updateFulfillment).toHaveBeenCalledTimes(1)
  })
})
