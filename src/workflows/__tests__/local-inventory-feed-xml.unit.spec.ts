import { describe, expect, it } from "@jest/globals";

import {
  buildLocalInventoryFeedXml,
  normalizeLocalInventoryAvailability,
  parseLocalInventoryStoreCodes,
  resolveLocalInventoryStoreCodes,
  validateLocalInventoryStoreCodes,
} from "../steps/build-local-inventory-feed-xml";

const GLOBAL_STORE_CODES_ENV = "PRODUCT_FEED_LOCAL_INVENTORY_STORE_CODES";
const HU_STORE_CODES_ENV = "PRODUCT_FEED_LOCAL_INVENTORY_STORE_CODES_HU";

const restoreEnv = (key: string, value: string | undefined) => {
  if (typeof value === "string") {
    process.env[key] = value;
    return;
  }

  delete process.env[key];
};

describe("local inventory feed xml helpers", () => {
  describe("store code parsing", () => {
    it("parses, trims and deduplicates store codes", () => {
      const result = parseLocalInventoryStoreCodes(" A ,B;A|\nC\t ");

      expect(result).toEqual(["A", "B", "C"]);
    });

    it("prefers country-specific env store codes over global values", () => {
      const originalGlobal = process.env[GLOBAL_STORE_CODES_ENV];
      const originalHu = process.env[HU_STORE_CODES_ENV];

      try {
        process.env[GLOBAL_STORE_CODES_ENV] = "GLOBAL_1,GLOBAL_2";
        process.env[HU_STORE_CODES_ENV] = "HU_1";

        const result = resolveLocalInventoryStoreCodes("hu");
        expect(result).toEqual(["HU_1"]);
      } finally {
        restoreEnv(GLOBAL_STORE_CODES_ENV, originalGlobal);
        restoreEnv(HU_STORE_CODES_ENV, originalHu);
      }
    });

    it("rejects non-alphanumeric store codes", () => {
      expect(() =>
        validateLocalInventoryStoreCodes(["HU_STORE_1"])
      ).toThrow("Invalid local inventory store code");
    });

    it("accepts alphanumeric store codes", () => {
      expect(() =>
        validateLocalInventoryStoreCodes(["HU001", "SKBRATISLAVA1"])
      ).not.toThrow();
    });
  });

  describe("availability normalization", () => {
    it("keeps explicit out-of-stock states", () => {
      const result = normalizeLocalInventoryAvailability({
        availability: "out of stock",
        quantity: 10,
      });

      expect(result).toBe("out of stock");
    });

    it("maps backorder to out of stock", () => {
      const result = normalizeLocalInventoryAvailability({
        availability: "backorder",
        quantity: 10,
      });

      expect(result).toBe("out of stock");
    });

    it("maps missing availability to in stock when quantity is positive", () => {
      const result = normalizeLocalInventoryAvailability({
        availability: "",
        quantity: 3,
      });

      expect(result).toBe("in stock");
    });
  });

  describe("xml generation", () => {
    it("generates one local inventory row per item and store code", () => {
      const xml = buildLocalInventoryFeedXml({
        items: [
          {
            id: "variant_123",
            title: "test",
            description: "test",
            link: "https://example.com/p",
            availability: "in stock",
            quantity: 4,
            price: "100.00 HUF",
            item_group_id: "prod_123",
          },
        ],
        storeCodes: ["HU001", "SK001"],
      });

      expect(xml).toContain("<g:store_code>HU001</g:store_code>");
      expect(xml).toContain("<g:store_code>SK001</g:store_code>");
      expect(xml).toContain("<g:id>variant_123</g:id>");
      expect(xml).toContain("<g:availability>in stock</g:availability>");
      expect(xml).toContain("<g:quantity>4</g:quantity>");
    });

    it("defaults quantity to 1 when item is in stock without quantity", () => {
      const xml = buildLocalInventoryFeedXml({
        items: [
          {
            id: "variant_456",
            title: "test",
            description: "test",
            link: "https://example.com/p2",
            availability: "in stock",
            price: "200.00 HUF",
            item_group_id: "prod_456",
          },
        ],
        storeCodes: ["HU001"],
      });

      expect(xml).toContain("<g:quantity>1</g:quantity>");
    });
  });
});
