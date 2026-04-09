import {
  buildRegionNetPreferencePlan,
  filterRegionsByCountryCodes,
  parseCountryCodeList,
} from "../pricing-net-preferences"

describe("pricing-net-preferences helpers", () => {
  it("parses and deduplicates country-code lists", () => {
    expect(parseCountryCodeList(" hu,sk,HU, ,  sk ")).toEqual([
      "hu",
      "sk",
    ])
  })

  it("plans creation when target regions have no region price preference", () => {
    const plan = buildRegionNetPreferencePlan({
      targetRegions: [
        { id: "reg_hu" },
        { id: "reg_sk" },
      ],
      preferences: [],
    })

    expect(plan.create).toEqual([
      {
        attribute: "region_id",
        value: "reg_hu",
        is_tax_inclusive: false,
      },
      {
        attribute: "region_id",
        value: "reg_sk",
        is_tax_inclusive: false,
      },
    ])
    expect(plan.updateIds).toEqual([])
  })

  it("filters regions by configured country code membership", () => {
    const regions = [
      {
        id: "reg_hu",
        countries: [{ iso_2: "HU" }],
      },
      {
        id: "reg_de",
        countries: [{ iso_2: "DE" }],
      },
    ]

    expect(filterRegionsByCountryCodes(regions, ["hu", "sk"])).toEqual([
      regions[0],
    ])
  })

  it("plans update only for tax-inclusive region preferences", () => {
    const plan = buildRegionNetPreferencePlan({
      targetRegions: [{ id: "reg_hu" }, { id: "reg_sk" }],
      preferences: [
        {
          id: "pp_hu",
          attribute: "region_id",
          value: "reg_hu",
          is_tax_inclusive: true,
        },
        {
          id: "pp_sk",
          attribute: "region_id",
          value: "reg_sk",
          is_tax_inclusive: false,
        },
      ],
    })

    expect(plan.create).toEqual([])
    expect(plan.updateIds).toEqual(["pp_hu"])
  })
})
