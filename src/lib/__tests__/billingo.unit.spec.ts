import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals"
import type { OrderDTO } from "@medusajs/types"

import {
  createBillingoInvoice,
  createBillingoReceipt,
  type BillingoConfig,
} from "../billingo"

type MockFetchResponse = {
  ok: boolean
  status: number
  statusText: string
  text: () => Promise<string>
  headers: {
    get: (name: string) => string | null
  }
}

const jsonResponse = (status: number, payload: unknown): MockFetchResponse => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status >= 200 && status < 300 ? "OK" : "Error",
  text: async () => JSON.stringify(payload),
  headers: {
    get: () => "application/json",
  },
})

const baseConfig: BillingoConfig = {
  apiKey: "test-api-key",
  baseUrl: "https://api.billingo.hu/v3",
  invoiceBlockId: 12345,
  paymentMethodDefault: "other",
  electronic: false,
  timeoutMs: 3_000,
  defaultDocumentType: "invoice",
  invoiceLanguage: "hu",
  invoiceUnit: "db",
  invoiceUnitPriceType: "gross",
  invoiceBankAccountId: 11,
}

const buildOrder = (
  overrides: Partial<Record<string, unknown>> = {}
) =>
  ({
    id: "order_test",
    display_id: 12,
    email: "partner@example.com",
    created_at: "2026-04-01T12:00:00.000Z",
    currency_code: "eur",
    total: 98100,
    item_total: 98100,
    tax_total: 0,
    shipping_total: 0,
    shipping_subtotal: 0,
    shipping_tax_total: 0,
    metadata: {},
    shipping_methods: [],
    billing_address: {
      company: "Viktor Nagy",
      address_1: "Kolarovo 9",
      city: "Kolarovo",
      postal_code: "94603",
      country_code: "SK",
    },
    shipping_address: {
      first_name: "Viktor",
      last_name: "Nagy",
      address_1: "Kolarovo 9",
      city: "Kolarovo",
      postal_code: "94603",
      country_code: "SK",
    },
    items: [
      {
        id: "item_1",
        title: "Gumiabroncs 385/55 R22,5",
        quantity: 4,
        detail: {
          quantity: 4,
          total: 95600,
          raw_total: { value: "95600" },
        },
        tax_lines: [{ rate: 0 }],
      },
      {
        id: "item_2",
        title: "Gumiabroncs szerelés",
        quantity: 1,
        detail: {
          quantity: 1,
          total: 2500,
          raw_total: { value: "2500" },
        },
        tax_lines: [{ rate: 0 }],
      },
    ],
    ...overrides,
  }) as unknown as OrderDTO

const buildMajorUnitOrder = (
  overrides: Partial<Record<string, unknown>> = {}
) =>
  ({
    id: "order_major_units",
    display_id: 81,
    email: "partner@example.com",
    created_at: "2026-04-01T14:38:51.694Z",
    currency_code: "eur",
    total: 2,
    item_total: 2,
    item_subtotal: 1.5748031496062993,
    item_tax_total: 0.4251968503937008,
    tax_total: 0.4251968503937008,
    shipping_total: 0,
    shipping_subtotal: 0,
    shipping_tax_total: 0,
    metadata: {},
    shipping_methods: [],
    billing_address: {
      company: "Viktor Nagy",
      address_1: "Kolarovo 9",
      city: "Kolarovo",
      postal_code: "94603",
      country_code: "SK",
    },
    shipping_address: {
      first_name: "Viktor",
      last_name: "Nagy",
      address_1: "Kolarovo 9",
      city: "Kolarovo",
      postal_code: "94603",
      country_code: "SK",
    },
    items: [
      {
        id: "item_major_1",
        title: "Test abroncs",
        quantity: 2,
        total: 2,
        subtotal: 1.5748031496062993,
        tax_total: 0.4251968503937008,
        detail: {
          quantity: 2,
          total: 2,
          subtotal: 1.5748031496062993,
          tax_total: 0.4251968503937008,
          raw_total: { value: "2", precision: 20 },
          raw_subtotal: {
            value: "1.5748031496062992126",
            precision: 20,
          },
          raw_tax_total: {
            value: "0.4251968503937007874",
            precision: 20,
          },
        },
        tax_lines: [{ rate: 27 }],
      },
    ],
    ...overrides,
  }) as unknown as OrderDTO

describe("billingo invoice generation", () => {
  const originalFetch = global.fetch
  const originalConversionRate = process.env.BILLINGO_CONVERSION_RATE
  const originalConversionRateEur =
    process.env.BILLINGO_CONVERSION_RATE_EUR

  beforeEach(() => {
    delete process.env.BILLINGO_CONVERSION_RATE
    delete process.env.BILLINGO_CONVERSION_RATE_EUR
  })

  afterEach(() => {
    global.fetch = originalFetch

    if (typeof originalConversionRate === "string") {
      process.env.BILLINGO_CONVERSION_RATE = originalConversionRate
    } else {
      delete process.env.BILLINGO_CONVERSION_RATE
    }

    if (typeof originalConversionRateEur === "string") {
      process.env.BILLINGO_CONVERSION_RATE_EUR = originalConversionRateEur
    } else {
      delete process.env.BILLINGO_CONVERSION_RATE_EUR
    }
  })

  it("keeps invoice product line items and adds conversion_rate from Billingo currencies API", async () => {
    let sentDocumentPayload: Record<string, unknown> | null = null

    global.fetch = jest
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = String(input)
        if (url.includes("/currencies?")) {
          return jsonResponse(200, {
            from_currency: "EUR",
            to_currency: "HUF",
            conversation_rate: 378.35,
            date: "2026-04-01",
          }) as unknown as Response
        }

        if (url.endsWith("/documents")) {
          sentDocumentPayload = JSON.parse(
            String(init?.body ?? "{}")
          ) as Record<string, unknown>
          return jsonResponse(200, {
            id: 1001,
            invoice_number: "TG-2026-1001",
          }) as unknown as Response
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      })

    const created = await createBillingoInvoice(buildOrder(), baseConfig)

    expect(created.id).toBe(1001)
    expect(sentDocumentPayload).not.toBeNull()
    const payload = sentDocumentPayload as unknown as Record<
      string,
      unknown
    >
    expect(payload.conversion_rate).toBe(378.35)
    expect(Array.isArray(payload.items)).toBe(true)
    expect((payload.items as unknown[]).length).toBe(2)

    const names = (payload.items as Array<{ name: string }>).map(
      (item) => item.name
    )
    expect(names).toEqual(
      expect.arrayContaining(["GUMIABRONCS 385/55 R22,5", "GUMIABRONCS szerelés"])
    )
    expect(names).not.toContain("Rendelés összesen")

    const legacyItems = payload.items as Array<{
      name: string
      unit_price: number
    }>
    const tireLine = legacyItems.find((item) =>
      item.name.includes("385/55 R22,5")
    )
    const serviceLine = legacyItems.find((item) =>
      item.name.includes("szerelés")
    )
    expect(tireLine?.unit_price).toBe(239)
    expect(serviceLine?.unit_price).toBe(25)
  })

  it("keeps major-unit EUR invoice totals without scaling by 100", async () => {
    let sentDocumentPayload: Record<string, unknown> | null = null

    global.fetch = jest
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = String(input)
        if (url.includes("/currencies?")) {
          return jsonResponse(200, {
            from_currency: "EUR",
            to_currency: "HUF",
            conversation_rate: 378.35,
            date: "2026-04-01",
          }) as unknown as Response
        }

        if (url.endsWith("/documents")) {
          sentDocumentPayload = JSON.parse(
            String(init?.body ?? "{}")
          ) as Record<string, unknown>
          return jsonResponse(200, {
            id: 1101,
            invoice_number: "TG-2026-1101",
          }) as unknown as Response
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      })

    const created = await createBillingoInvoice(
      buildMajorUnitOrder(),
      baseConfig
    )

    expect(created.id).toBe(1101)
    const payload = sentDocumentPayload as unknown as Record<
      string,
      unknown
    >
    expect(Array.isArray(payload.items)).toBe(true)

    const items = payload.items as Array<{
      unit_price: number
      quantity: number
    }>
    expect(items[0]?.unit_price).toBe(1)
    expect(items[0]?.quantity).toBe(2)
  })

  it("keeps major-unit EUR receipt totals without scaling by 100", async () => {
    let sentReceiptPayload: Record<string, unknown> | null = null

    global.fetch = jest
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = String(input)
        if (url.includes("/currencies?")) {
          return jsonResponse(200, {
            from_currency: "EUR",
            to_currency: "HUF",
            conversation_rate: 378.35,
            date: "2026-04-01",
          }) as unknown as Response
        }

        if (url.endsWith("/documents/receipt")) {
          sentReceiptPayload = JSON.parse(
            String(init?.body ?? "{}")
          ) as Record<string, unknown>
          return jsonResponse(200, {
            id: 1102,
            invoice_number: "TG-2026-1102",
          }) as unknown as Response
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      })

    const created = await createBillingoReceipt(
      buildMajorUnitOrder(),
      baseConfig
    )

    expect(created.id).toBe(1102)
    const payload = sentReceiptPayload as unknown as Record<
      string,
      unknown
    >
    const items = payload.items as Array<{
      name: string
      unit_price: number
    }>
    expect(items[0]?.name).toContain("x2")
    expect(items[0]?.unit_price).toBe(2)
  })

  it("auto-corrects obvious 100x mismatch and logs warning", async () => {
    let sentDocumentPayload: Record<string, unknown> | null = null
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    try {
      global.fetch = jest
        .fn<typeof fetch>()
        .mockImplementation(async (input, init) => {
          const url = String(input)
          if (url.includes("/currencies?")) {
            return jsonResponse(200, {
              from_currency: "EUR",
              to_currency: "HUF",
              conversation_rate: 378.35,
              date: "2026-04-01",
            }) as unknown as Response
          }

          if (url.endsWith("/documents")) {
            sentDocumentPayload = JSON.parse(
              String(init?.body ?? "{}")
            ) as Record<string, unknown>
            return jsonResponse(200, {
              id: 1103,
              invoice_number: "TG-2026-1103",
            }) as unknown as Response
          }

          throw new Error(`Unexpected fetch URL: ${url}`)
        })

      const created = await createBillingoInvoice(
        buildMajorUnitOrder({
          total: 2,
          subtotal: 2,
          item_total: 20_000,
          item_subtotal: 20_000,
          tax_total: 0,
          item_tax_total: 0,
          items: [
            {
              id: "item_inconsistent",
              title: "Inconsistent line",
              quantity: 1,
              total: 20_000,
              detail: {
                quantity: 1,
                total: 20_000,
                raw_total: { value: "20000" },
              },
              tax_lines: [{ rate: 0 }],
            },
          ],
        }),
        baseConfig
      )

      expect(created.id).toBe(1103)
      const payload = sentDocumentPayload as unknown as Record<
        string,
        unknown
      >
      const items = payload.items as Array<{ unit_price: number }>
      expect(items[0]?.unit_price).toBe(2)
      expect(warnSpy).toHaveBeenCalledWith(
        "[Billingo] amount mode auto-correction applied",
        expect.objectContaining({
          fromMode: "minor",
          toMode: "major",
        })
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("fails fast for invoice when order item lines are missing", async () => {
    const orderWithoutItems = buildOrder({
      currency_code: "huf",
      items: [],
      shipping_total: 0,
      shipping_subtotal: 0,
    })

    await expect(
      createBillingoInvoice(orderWithoutItems, baseConfig)
    ).rejects.toThrow("Billingo: invoice items missing")
  })

  it("fails fast for non-HUF invoice when conversion_rate cannot be resolved", async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes("/currencies?")) {
          return jsonResponse(200, {
            from_currency: "EUR",
            to_currency: "HUF",
          }) as unknown as Response
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      })

    await expect(
      createBillingoInvoice(buildOrder(), baseConfig)
    ).rejects.toThrow("Billingo: missing conversion_rate for non-HUF invoice (EUR)")
  })

  it("uses env conversion rate as fallback when Billingo currency API has no value", async () => {
    process.env.BILLINGO_CONVERSION_RATE_EUR = "385.12"
    let sentDocumentPayload: Record<string, unknown> | null = null

    global.fetch = jest
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = String(input)
        if (url.includes("/currencies?")) {
          return jsonResponse(200, {
            from_currency: "EUR",
            to_currency: "HUF",
          }) as unknown as Response
        }

        if (url.endsWith("/documents")) {
          sentDocumentPayload = JSON.parse(
            String(init?.body ?? "{}")
          ) as Record<string, unknown>
          return jsonResponse(200, {
            id: 1002,
            invoice_number: "TG-2026-1002",
          }) as unknown as Response
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      })

    const created = await createBillingoInvoice(buildOrder(), baseConfig)

    expect(created.id).toBe(1002)
    const payload = sentDocumentPayload as unknown as Record<
      string,
      unknown
    >
    expect(payload.conversion_rate).toBe(385.12)
  })
})
