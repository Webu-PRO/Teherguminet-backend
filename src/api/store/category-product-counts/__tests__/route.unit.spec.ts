import { describe, expect, it } from "@jest/globals";

import { toCategoryProductCounts } from "../route";

describe("category product counts mapping", () => {
  it("keys counts by category id and coerces pg bigint strings", () => {
    expect(
      toCategoryProductCounts([
        { product_category_id: "pcat_a", count: "32" },
        { product_category_id: "pcat_b", count: 7 },
      ])
    ).toEqual({ pcat_a: 32, pcat_b: 7 });
  });

  it("drops rows without a category id or with a non-numeric count", () => {
    expect(
      toCategoryProductCounts([
        { product_category_id: "", count: "3" },
        { product_category_id: "pcat_c", count: "abc" },
      ])
    ).toEqual({});
  });
});
