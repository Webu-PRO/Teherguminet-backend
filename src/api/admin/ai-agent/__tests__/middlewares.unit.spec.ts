import { AdminTranslateHuToSk } from "../middlewares"

describe("admin ai-agent middleware schema", () => {
  it("accepts valid payload", () => {
    const parsed = AdminTranslateHuToSk.safeParse({
      title_hu: "Magyar cím",
      description_hu: "Magyar leírás",
      title_sk: "",
      description_sk: "",
      overwrite: false,
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects unknown fields", () => {
    const parsed = AdminTranslateHuToSk.safeParse({
      title_hu: "Magyar cím",
      extra: "field",
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects too long title_hu", () => {
    const parsed = AdminTranslateHuToSk.safeParse({
      title_hu: "a".repeat(501),
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects non-boolean overwrite", () => {
    const parsed = AdminTranslateHuToSk.safeParse({
      title_hu: "Magyar cím",
      overwrite: "yes",
    })

    expect(parsed.success).toBe(false)
  })
})
