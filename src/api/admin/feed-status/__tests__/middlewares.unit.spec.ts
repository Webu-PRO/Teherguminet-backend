import { AdminUpdateFeedStatus } from "../middlewares"

describe("admin feed-status middleware schema", () => {
  it("accepts valid payload", () => {
    const parsed = AdminUpdateFeedStatus.safeParse({
      market: "reg_123",
      channel: "facebook",
      active: true,
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects empty market identifier", () => {
    const parsed = AdminUpdateFeedStatus.safeParse({
      market: " ",
      channel: "facebook",
      active: true,
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects unknown channel", () => {
    const parsed = AdminUpdateFeedStatus.safeParse({
      market: "reg_123",
      channel: "meta",
      active: true,
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects non-boolean active flag", () => {
    const parsed = AdminUpdateFeedStatus.safeParse({
      market: "reg_456",
      channel: "google",
      active: "yes",
    })

    expect(parsed.success).toBe(false)
  })
})
