import { describe, expect, it } from "@jest/globals";

import {
  LOCAL_INVENTORY_FEED_FALLBACK_ERROR_MESSAGE,
  mapLocalInventoryFeedError,
} from "../route";

describe("local inventory feed route error mapping", () => {
  it("returns 400 for missing store-code configuration", () => {
    const error = new Error(
      "Local inventory feed requires store codes. Set PRODUCT_FEED_LOCAL_INVENTORY_STORE_CODES or PRODUCT_FEED_LOCAL_INVENTORY_STORE_CODES_<COUNTRY_CODE>."
    );

    expect(mapLocalInventoryFeedError(error)).toEqual({
      status: 400,
      message: error.message,
    });
  });

  it("returns 400 for missing storefront base-url configuration", () => {
    const error = {
      message:
        "Product feed requires an absolute storefront URL. Set PRODUCT_FEED_STOREFRONT_URL.",
    };

    expect(mapLocalInventoryFeedError(error)).toEqual({
      status: 400,
      message: error.message,
    });
  });

  it("returns generic 500 for unknown failures", () => {
    expect(mapLocalInventoryFeedError(new Error("Database timeout"))).toEqual({
      status: 500,
      message: LOCAL_INVENTORY_FEED_FALLBACK_ERROR_MESSAGE,
    });
  });
});
