import { describe, expect, it, jest } from "@jest/globals"
import ResendNotificationProviderService from "../service"

type MockSendResult = {
  data: { id: string }
  error: null
}

const createService = (options: Record<string, unknown> = {}) =>
  new ResendNotificationProviderService(
    {
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      } as any,
    },
    {
      api_key: "test_key",
      from: "noreply@teherguminet.hu",
      ...options,
    }
  )

describe("own delivery status templates", () => {
  it("resolves Slovak pickup-ready subject from order country", () => {
    const service = createService()

    const subject = service.getTemplateSubject({
      template: "order-pickup-ready",
      to: "partner@example.com",
      data: {
        order: {
          id: "order_pickup_sk",
          display_id: 88,
          shipping_address: {
            country_code: "sk",
          },
        },
      },
    } as any)

    expect(subject).toContain("pripravená na osobný odber")
  })

  it("resolves Hungarian pickup-cancelled subject from order metadata", () => {
    const service = createService()

    const subject = service.getTemplateSubject({
      template: "order-pickup-cancelled",
      to: "partner@example.com",
      data: {
        order: {
          id: "order_pickup_cancel_hu",
          display_id: 89,
          metadata: {
            language: "hu",
          },
        },
      },
    } as any)

    expect(subject).toContain("átvétel visszavonva")
  })

  it("resolves Hungarian and Slovak subjects for own-delivery fulfillment-created template", () => {
    const service = createService()

    const huSubject = service.getTemplateSubject({
      template: "own-delivery-fulfillment-created",
      to: "partner@teherguminet.hu",
      data: {
        order: {
          id: "order_0",
          display_id: 41,
          metadata: { language: "hu" },
        },
      },
    } as any)

    const skSubject = service.getTemplateSubject({
      template: "own-delivery-fulfillment-created",
      to: "partner@teherguminet.sk",
      data: {
        order: {
          id: "order_0b",
          display_id: 410,
          metadata: { language: "sk" },
        },
      },
    } as any)

    expect(huSubject).toContain("előkészítve")
    expect(skSubject).toContain("pripravená")
    expect(
      service.getTemplate("own-delivery-fulfillment-created" as any)
    ).toBeTruthy()
  })

  it("resolves Hungarian and Slovak subjects for own-delivery shipped template", () => {
    const service = createService()

    const huSubject = service.getTemplateSubject({
      template: "own-delivery-shipped",
      to: "partner@teherguminet.hu",
      data: {
        order: {
          id: "order_1",
          display_id: 42,
          metadata: { language: "hu" },
        },
      },
    } as any)

    const skSubject = service.getTemplateSubject({
      template: "own-delivery-shipped",
      to: "partner@teherguminet.sk",
      data: {
        order: {
          id: "order_2",
          display_id: 43,
          metadata: { language: "sk" },
        },
      },
    } as any)

    expect(huSubject).toContain("szállítás elindult")
    expect(skSubject).toContain("na ceste")
    expect(service.getTemplate("own-delivery-shipped" as any)).toBeTruthy()
  })

  it("resolves Hungarian and Slovak subjects for own-delivery delivered template", () => {
    const service = createService()

    const huSubject = service.getTemplateSubject({
      template: "own-delivery-delivered",
      to: "partner@teherguminet.hu",
      data: {
        order: {
          id: "order_3",
          display_id: 44,
          metadata: { language: "hu" },
        },
      },
    } as any)

    const skSubject = service.getTemplateSubject({
      template: "own-delivery-delivered",
      to: "partner@teherguminet.sk",
      data: {
        order: {
          id: "order_4",
          display_id: 45,
          metadata: { language: "sk" },
        },
      },
    } as any)

    expect(huSubject).toContain("sikeresen")
    expect(skSubject).toContain("úspešne")
    expect(service.getTemplate("own-delivery-delivered" as any)).toBeTruthy()
  })

  it("passes dynamic variables to Resend template IDs for own-delivery templates", async () => {
    const service = createService({
      template_ids: {
        "own-delivery-shipped": "tpl_shipped_hu",
      },
    })

    const sendMock = jest
      .fn<(...args: any[]) => Promise<MockSendResult>>()
      .mockResolvedValue({
        data: { id: "email_1" },
        error: null,
      })

    ;(service as any).resendClient = {
      emails: {
        send: sendMock,
      },
    }

    await service.send({
      to: "partner@teherguminet.hu",
      template: "own-delivery-shipped",
      data: {
        order: {
          id: "order_1",
          display_id: 19,
          metadata: { language: "hu" },
          customer: { first_name: "Péter" },
        },
      },
    } as any)

    expect(sendMock).toHaveBeenCalledTimes(1)
    const sent = sendMock.mock.calls[0][0]
    expect(sent.template.id).toBe("tpl_shipped_hu")
    expect(sent.template.variables.order_id).toBe("TG-000019")
    expect(sent.template.variables.customer_name).toBe("Péter")
    expect(sent.template.variables.order_url).toContain(
      "/hu/store/orders/TG-000019"
    )
  })

  it("passes dynamic variables to Resend template IDs for pickup templates", async () => {
    const service = createService({
      template_ids: {
        "order-pickup-ready.sk": "tpl_pickup_ready_sk",
      },
    })

    const sendMock = jest
      .fn<(...args: any[]) => Promise<MockSendResult>>()
      .mockResolvedValue({
        data: { id: "email_2" },
        error: null,
      })

    ;(service as any).resendClient = {
      emails: {
        send: sendMock,
      },
    }

    await service.send({
      to: "partner@teherguminet.sk",
      template: "order-pickup-ready",
      data: {
        order: {
          id: "order_pickup_1",
          display_id: 23,
          shipping_address: { country_code: "sk", first_name: "Ján" },
        },
      },
    } as any)

    expect(sendMock).toHaveBeenCalledTimes(1)
    const sent = sendMock.mock.calls[0][0]
    expect(sent.template.id).toBe("tpl_pickup_ready_sk")
    expect(sent.template.variables.order_id).toBe("TG-000023")
    expect(sent.template.variables.customer_name).toBe("Ján")
    expect(sent.template.variables.order_url).toContain(
      "/sk/store/orders/TG-000023"
    )
  })
})
