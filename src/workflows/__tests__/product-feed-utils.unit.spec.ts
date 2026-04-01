import { describe, expect, it } from "@jest/globals";

import {
  formatPrice,
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
});
