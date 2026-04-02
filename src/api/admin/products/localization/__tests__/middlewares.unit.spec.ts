import { AdminUpdateProductLocalization } from "../middlewares"

describe("admin product localization middleware schema", () => {
  it("accepts valid payload", () => {
    const parsed = AdminUpdateProductLocalization.safeParse({
      title_hu: "Magyar cím",
      description_hu: "Magyar leírás",
      title_sk: "Slovenský názov",
      description_sk: "Slovenský popis",
    })

    expect(parsed.success).toBe(true)
  })

  it("accepts partial payload", () => {
    const parsed = AdminUpdateProductLocalization.safeParse({
      title_hu: "Magyar cím",
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects unknown field", () => {
    const parsed = AdminUpdateProductLocalization.safeParse({
      title_hu: "Magyar cím",
      extra: "x",
    })

    expect(parsed.success).toBe(false)
  })
})

