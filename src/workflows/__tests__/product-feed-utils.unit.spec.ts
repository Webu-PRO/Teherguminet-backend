import { describe, expect, it } from "@jest/globals";

import {
  formatPrice,
  normalizeAvailabilityQuantity,
  resolveFeedStock,
  resolveLocalizedFeedDescription,
  resolveLocalizedFeedTitle,
  resolveAdditionalImageLink,
  resolveFeedImageUrl,
  resolveStorefrontBaseUrl,
} from "../steps/get-product-feed-items";

describe("product feed utils", () => {
  describe("formatPrice", () => {
    it("formats prices with two decimals and uppercase currency", () => {
      expect(formatPrice(19, "eur")).toBe("19.00 EUR");
      expect(formatPrice(19.5, "huf")).toBe("19.50 HUF");
    });
  });

  describe("availability helpers", () => {
    it("normalizes invalid availability values to zero", () => {
      expect(normalizeAvailabilityQuantity(undefined)).toBe(0);
      expect(normalizeAvailabilityQuantity(null)).toBe(0);
      expect(normalizeAvailabilityQuantity(Number.NaN)).toBe(0);
      expect(normalizeAvailabilityQuantity(-2)).toBe(0);
      expect(normalizeAvailabilityQuantity(3.9)).toBe(3);
    });

    it("marks variant in stock when quantity is positive", () => {
      expect(
        resolveFeedStock({
          manageInventory: true,
          quantity: 2,
        })
      ).toEqual({
        status: "in stock",
        quantity: 2,
      });
    });

    it("marks variant out of stock when quantity is missing", () => {
      expect(
        resolveFeedStock({
          manageInventory: true,
          quantity: undefined,
        })
      ).toEqual({
        status: "out of stock",
        quantity: 0,
      });
    });

    it("keeps non-managed inventory always in stock and omits quantity", () => {
      expect(
        resolveFeedStock({
          manageInventory: false,
          quantity: 0,
        })
      ).toEqual({
        status: "in stock",
        quantity: undefined,
      });
    });
  });

  describe("resolveStorefrontBaseUrl", () => {
    it("prefers config storefront URL", () => {
      const result = resolveStorefrontBaseUrl(
        "https://teherguminet.hu/",
        "https://fallback.example.com"
      );

      expect(result).toBe("https://teherguminet.hu");
    });

    it("falls back to env storefront URL", () => {
      const result = resolveStorefrontBaseUrl(
        "",
        "teherguminet.hu"
      );

      expect(result).toBe("https://teherguminet.hu");
    });

    it("returns undefined when neither value is a valid absolute URL", () => {
      const result = resolveStorefrontBaseUrl("", "not a valid url");

      expect(result).toBeUndefined();
    });
  });

  describe("image url helpers", () => {
    const storefrontBaseUrl = "https://teherguminet.hu";

    it("normalizes relative image URLs", () => {
      const result = resolveFeedImageUrl("/uploads/tire.jpg", storefrontBaseUrl);

      expect(result).toBe("https://teherguminet.hu/uploads/tire.jpg");
    });

    it("returns first additional image that differs from primary", () => {
      const result = resolveAdditionalImageLink(
        [
          { url: "https://cdn.example.com/main.jpg" },
          { url: "/uploads/additional.jpg" },
          { url: "https://cdn.example.com/second.jpg" },
        ],
        "https://cdn.example.com/main.jpg",
        storefrontBaseUrl
      );

      expect(result).toBe("https://teherguminet.hu/uploads/additional.jpg");
    });
  });

  describe("resolveLocalizedFeedDescription", () => {
    it("uses SK metadata description for SK feed", () => {
      const result = resolveLocalizedFeedDescription(
        {
          title: "Fallback title",
          description: "Default description",
          metadata: {
            description_sk: "Slovenský popis",
            description_hu: "Magyar leírás",
          },
        },
        "sk"
      );

      expect(result).toBe("Slovenský popis");
    });

    it("uses HU metadata description for HU feed", () => {
      const result = resolveLocalizedFeedDescription(
        {
          title: "Fallback title",
          description: "Default description",
          metadata: {
            description_hu: "Magyar leírás",
          },
        },
        "hu"
      );

      expect(result).toBe("Magyar leírás");
    });

    it("falls back to default description when localized value is missing", () => {
      const result = resolveLocalizedFeedDescription(
        {
          title: "Fallback title",
          description: "Default description",
          metadata: {},
        },
        "sk"
      );

      expect(result).toBe("Default description");
    });

    it("falls back to HU description when SK description is missing", () => {
      const result = resolveLocalizedFeedDescription(
        {
          title: "Fallback title",
          description: "Default description",
          metadata: {
            description_hu: "Magyar leírás",
          },
        },
        "sk"
      );

      expect(result).toBe("Magyar leírás");
    });

    it("falls back to title when all descriptions are missing", () => {
      const result = resolveLocalizedFeedDescription(
        {
          title: "Fallback title",
          description: "   ",
          metadata: {
            description_sk: "   ",
          },
        },
        "sk"
      );

      expect(result).toBe("Fallback title");
    });
  });

  describe("resolveLocalizedFeedTitle", () => {
    it("uses SK metadata title for SK feed", () => {
      const result = resolveLocalizedFeedTitle(
        {
          title: "Default title",
          metadata: {
            title_hu: "Magyar cím",
            title_sk: "Slovenský názov",
          },
        },
        "sk"
      );

      expect(result).toBe("Slovenský názov");
    });

    it("falls back to HU title when SK title is missing", () => {
      const result = resolveLocalizedFeedTitle(
        {
          title: "Default title",
          metadata: {
            title_hu: "Magyar cím",
          },
        },
        "sk"
      );

      expect(result).toBe("Magyar cím");
    });

    it("falls back to default title when localized titles are missing", () => {
      const result = resolveLocalizedFeedTitle(
        {
          title: "Default title",
          metadata: {},
        },
        "sk"
      );

      expect(result).toBe("Default title");
    });
  });
});
