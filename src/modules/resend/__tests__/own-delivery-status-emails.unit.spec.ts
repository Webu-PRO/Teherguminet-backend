import ResendNotificationProviderService from "../service"

const createService = () =>
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
    }
  )

describe("own delivery status templates", () => {
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
})
