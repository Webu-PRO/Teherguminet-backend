import MagyarPostaFulfillmentProviderService from "../service"

/**
 * The tier calculation is private, so these drive it the way Medusa does —
 * through calculatePrice with a context shaped like a real cart.
 */
const service = () =>
  new MagyarPostaFulfillmentProviderService(
    { logger: { info: () => {}, warn: () => {}, error: () => {} } } as never,
    {} as never
  )

const item = (weight: number | null, quantity = 1) => ({
  quantity,
  variant: { weight },
})

const price = async (
  items: Array<ReturnType<typeof item>>,
  optionData: Record<string, unknown> = {}
) =>
  (
    await service().calculatePrice(optionData, {}, { items } as never)
  ).calculated_amount

describe("Magyar Posta weight tiers", () => {
  test("prices each item from its own weight", async () => {
    // Default tiers: <=10kg 1567, <=20kg 2354, <=40kg 4717. Weights are grams.
    await expect(price([item(5000)])).resolves.toBe(1567)
    await expect(price([item(15000)])).resolves.toBe(2354)
    await expect(price([item(30000)])).resolves.toBe(4717)
  })

  test("multiplies by quantity", async () => {
    await expect(price([item(5000, 3)])).resolves.toBe(1567 * 3)
  })

  test("an item with no weight stops the tier quote", async () => {
    // This is the regression. A truck tyre carries no weight in this
    // catalogue, and treating that as 0 kg put it in the lightest tier: four
    // of them quoted 6268 HUF for a carrier with a 40 kg parcel limit.
    // Declining leaves the configured flat amount, which is at least a number
    // somebody chose.
    const withMissing = await price([item(null)])
    const withZero = await price([item(0)])
    const fabricated = 1567

    expect(withMissing).not.toBe(fabricated)
    expect(withZero).not.toBe(fabricated)
  })

  test("one unweighed item disqualifies the whole cart", async () => {
    // Summing the known items and skipping the unknown one would under-quote
    // just as silently.
    const mixed = await price([item(5000), item(null)])

    expect(mixed).not.toBe(1567)
  })

  test("four unweighed truck tyres no longer quote 6268", async () => {
    const observedInProduction = 6268
    const quoted = await price([item(null, 4)])

    expect(quoted).not.toBe(observedInProduction)
  })
})
