import { AdminUpdateFeedStatus } from "../middlewares"

describe("admin feed-status middleware schema", () => {
  it("accepts valid payload", () => {
    const parsed = AdminUpdateFeedStatus.safeParse({
      market: "hu_huf",
      channel: "facebook",
      active: true,
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects unknown market", () => {
    const parsed = AdminUpdateFeedStatus.safeParse({
      market: "hu_eur",
      channel: "facebook",
      active: true,
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects unknown channel", () => {
    const parsed = AdminUpdateFeedStatus.safeParse({
      market: "hu_huf",
      channel: "meta",
      active: true,
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects non-boolean active flag", () => {
    const parsed = AdminUpdateFeedStatus.safeParse({
      market: "sk_eur",
      channel: "google",
      active: "yes",
    })

    expect(parsed.success).toBe(false)
  })
})
