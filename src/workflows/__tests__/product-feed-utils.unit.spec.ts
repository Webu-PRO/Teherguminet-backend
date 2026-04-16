import { describe, expect, it } from "@jest/globals";

import {
  formatPrice,
  normalizeGoogleFeedTitle,
  normalizeAvailabilityQuantity,
  resolveFeedAvailabilityDate,
  resolveFeedCertification,
  resolveFeedShippingEntries,
  resolveFeedShippingWeight,
  resolveFeedStock,
  resolveLocalizedFeedDescription,
  resolveLocalizedFeedTitle,
  resolveAdditionalImageLink,
  resolveFeedBrand,
  resolveFeedGoogleProductCategory,
  resolveFeedImageUrl,
  resolvePrimaryImageLink,
  resolveFeedSize,
  resolveFeedSizeChart,
  resolveFeedShippingCountryCodes,
  resolveStorefrontBaseUrl,
  resolveProductFeedLink,
  resolveStorefrontLinkBaseUrl,
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
          allowBackorder: false,
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
          allowBackorder: false,
          quantity: undefined,
        })
      ).toEqual({
        status: "out of stock",
        quantity: 0,
      });
    });

    it("marks variant as backorder when quantity is zero and backorder is allowed", () => {
      expect(
        resolveFeedStock({
          manageInventory: true,
          allowBackorder: true,
          quantity: 0,
        })
      ).toEqual({
        status: "backorder",
        quantity: undefined,
      });
    });

    it("marks variant as backorder when quantity is invalid and backorder is allowed", () => {
      expect(
        resolveFeedStock({
          manageInventory: true,
          allowBackorder: true,
          quantity: undefined,
        })
      ).toEqual({
        status: "backorder",
        quantity: undefined,
      });
    });

    it("keeps non-managed inventory always in stock and omits quantity", () => {
      expect(
        resolveFeedStock({
          manageInventory: false,
          allowBackorder: true,
          quantity: 0,
        })
      ).toEqual({
        status: "in stock",
        quantity: undefined,
      });
    });
  });

  describe("resolveStorefrontBaseUrl", () => {
    it("prefers feed-specific storefront URL env", () => {
      const result = resolveStorefrontBaseUrl(
        "https://feed.example.com",
        "https://teherguminet.hu/",
        "https://fallback.example.com",
        "https://store.example.com"
      );

      expect(result).toBe("https://feed.example.com");
    });

    it("falls back to env storefront URL", () => {
      const result = resolveStorefrontBaseUrl(
        "",
        "",
        "teherguminet.hu",
        ""
      );

      expect(result).toBe("https://teherguminet.hu");
    });

    it("falls back to first non-local STORE_CORS origin", () => {
      const result = resolveStorefrontBaseUrl(
        "",
        "",
        "",
        "http://localhost:8000,https://teherguminet.hu,https://www.teherguminet.hu"
      );

      expect(result).toBe("https://teherguminet.hu");
    });

    it("falls back to localhost STORE_CORS origin when no other value is valid", () => {
      const result = resolveStorefrontBaseUrl(
        "",
        "not a valid url",
        "also invalid",
        "localhost:8000"
      );

      expect(result).toBe("https://localhost:8000");
    });
  });

  describe("resolveStorefrontLinkBaseUrl", () => {
    it("prefers explicit feed link URL override when provided", () => {
      const result = resolveStorefrontLinkBaseUrl(
        "https://www.teherguminet.hu/",
        "https://teherguminet.hu"
      );

      expect(result).toBe("https://www.teherguminet.hu");
    });

    it("falls back to storefront base URL when link override is missing", () => {
      const result = resolveStorefrontLinkBaseUrl(
        "",
        "https://teherguminet.hu"
      );

      expect(result).toBe("https://teherguminet.hu");
    });
  });

  describe("resolveProductFeedLink", () => {
    it("builds localized product links under /products route", () => {
      const result = resolveProductFeedLink({
        storefrontLinkBaseUrl: "https://www.teherguminet.hu",
        countryCode: "hu",
        productHandle: "385-65r22.5-24-164j-mixed-g12-hubtrac",
      });

      expect(result).toBe(
        "https://www.teherguminet.hu/hu/products/385-65r22.5-24-164j-mixed-g12-hubtrac"
      );
    });
  });

  describe("resolveFeedShippingCountryCodes", () => {
    it("parses unique uppercase country codes from env-style string", () => {
      const result = resolveFeedShippingCountryCodes(
        "hu, sk;cz|HU invalid"
      );

      expect(result).toEqual(["HU", "SK", "CZ"]);
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

    it("skips known label images when picking primary image", () => {
      const result = resolvePrimaryImageLink({
        thumbnail: "https://cdn.example.com/energy-label.jpg",
        images: [
          { url: "https://cdn.example.com/eprel-sheet.png" },
          { url: "/uploads/product-main.jpg" },
        ],
        storefrontBaseUrl,
      });

      expect(result).toBe("https://teherguminet.hu/uploads/product-main.jpg");
    });
  });

  describe("resolveLocalizedFeedDescription", () => {
    it("prefers DB localization description over metadata for SK feed", () => {
      const result = resolveLocalizedFeedDescription(
        {
          title: "Fallback title",
          description: "Default description",
          metadata: {
            description_sk: "Metadata SK popis",
          },
        },
        "sk",
        {
          id: "ploc_1",
          product_id: "prod_1",
          description_sk: "DB SK popis",
        }
      );

      expect(result).toBe("DB SK popis");
    });

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
    it("prefers DB localization title over metadata for SK feed", () => {
      const result = resolveLocalizedFeedTitle(
        {
          title: "Default title",
          metadata: {
            title_sk: "Metadata SK názov",
          },
        },
        "sk",
        {
          id: "ploc_1",
          product_id: "prod_1",
          title_sk: "DB SK názov",
        }
      );

      expect(result).toBe("DB SK názov");
    });

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

  describe("resolveFeedBrand", () => {
    it("uses metadata brand when available", () => {
      const result = resolveFeedBrand({
        product: {
          handle: "315-70r22-5-18-156-150l-highway-d11-hubtrac",
          metadata: {
            brand: "Hubtrac",
          },
        },
        variant: null,
        localizedTitle: "315/70R22.5-18 156/150L HIGHWAY D11",
        localizedDescription: "Leírás",
      });

      expect(result).toBe("HUBTRAC");
    });

    it("keeps non-known metadata brand values", () => {
      const result = resolveFeedBrand({
        product: {
          handle: "example-product",
          metadata: {
            brand: "Goodyear",
          },
        },
        variant: null,
        localizedTitle: "Product title",
        localizedDescription: "Description",
      });

      expect(result).toBe("Goodyear");
    });

    it("infers known brand from handle when metadata is missing", () => {
      const result = resolveFeedBrand({
        product: {
          handle: "295-80r22-5-16-152-148m-regional-d11-hubtrac",
          metadata: {},
        },
        variant: null,
        localizedTitle: "Product title",
        localizedDescription: "Description",
      });

      expect(result).toBe("HUBTRAC");
    });

    it("returns undefined when brand cannot be inferred", () => {
      const result = resolveFeedBrand({
        product: {
          handle: "random-product",
          metadata: {},
        },
        variant: null,
        localizedTitle: "Generic tire",
        localizedDescription: "No known brand token",
      });

      expect(result).toBeUndefined();
    });
  });

  describe("category and size helpers", () => {
    it("resolves google product category from variant metadata first", () => {
      const result = resolveFeedGoogleProductCategory({
        productMetadata: {
          google_product_category: "Vehicles & Parts > Vehicle Parts",
        },
        variantMetadata: {
          google_product_category:
            "Vehicles & Parts > Vehicle Parts & Accessories > Motor Vehicle Tires",
        },
      });

      expect(result).toBe(
        "Vehicles & Parts > Vehicle Parts & Accessories > Motor Vehicle Tires"
      );
    });

    it("extracts size from title when metadata size is missing", () => {
      const result = resolveFeedSize({
        localizedTitle: "315/60R22.5-18 154/150L HIGHWAY S11",
        productMetadata: {},
        variantMetadata: {},
      });

      expect(result).toBe("315/60R22.5");
    });

    it("normalizes relative size chart links to absolute URLs", () => {
      const result = resolveFeedSizeChart({
        storefrontBaseUrl: "https://teherguminet.hu",
        productMetadata: {
          size_chart: "/uploads/size-chart-s11.png",
        },
        variantMetadata: {},
      });

      expect(result).toBe("https://teherguminet.hu/uploads/size-chart-s11.png");
    });
  });

  describe("google feed compliance helpers", () => {
    it("normalizes all-uppercase titles while preserving size codes", () => {
      const result = normalizeGoogleFeedTitle(
        "315/70R22.5-18 156/150L HIGHWAY D11 HUBTRAC"
      );

      expect(result).toBe("315/70R22.5-18 156/150L Highway D11 Hubtrac");
    });

    it("resolves shipping weight in kg from variant metadata grams", () => {
      const result = resolveFeedShippingWeight({
        variantWeight: undefined,
        productMetadata: {},
        variantMetadata: {
          shipping_weight_g: 12500,
        },
      });

      expect(result).toBe("12.5 kg");
    });

    it("resolves shipping weight from gls metadata keys", () => {
      const result = resolveFeedShippingWeight({
        variantWeight: undefined,
        productMetadata: {
          gls_weight_kg: "18.4",
        },
        variantMetadata: {},
      });

      expect(result).toBe("18.4 kg");
    });

    it("returns metadata availability_date when present", () => {
      const result = resolveFeedAvailabilityDate({
        availability: "backorder",
        productMetadata: {
          availability_date: "2026-05-01",
        },
        variantMetadata: {},
      });

      expect(result).toBe("2026-05-01T00:00:00.000Z");
    });

    it("returns default availability_date when availability is backorder and metadata is missing", () => {
      const result = resolveFeedAvailabilityDate({
        availability: "backorder",
        productMetadata: {},
        variantMetadata: {},
      });

      expect(result).toBeDefined();
    });

    it("returns default availability_date when availability is preorder", () => {
      const result = resolveFeedAvailabilityDate({
        availability: "pre_order",
        productMetadata: {},
        variantMetadata: {},
      });

      expect(result).toBeDefined();
    });

    it("returns certification from metadata", () => {
      const result = resolveFeedCertification({
        productMetadata: {
          certification: "EC|EPREL|12345",
        },
        variantMetadata: {},
      });

      expect(result).toBe("EC|EPREL|12345");
    });

    it("builds shipping entries with default service and zero fallback price", () => {
      const result = resolveFeedShippingEntries({
        countryCode: "hu",
        currencyCode: "huf",
        productMetadata: {},
        variantMetadata: {},
      });

      expect(result).toEqual([
        {
          country: "HU",
          price: "0.00 HUF",
          service: "Standard",
        },
      ]);
    });

    it("builds shipping entries for additional configured countries", () => {
      const result = resolveFeedShippingEntries({
        countryCode: "hu",
        currencyCode: "huf",
        shippingCountryCodes: ["sk", "HU", "cz"],
        productMetadata: {},
        variantMetadata: {},
      });

      expect(result).toEqual([
        {
          country: "HU",
          price: "0.00 HUF",
          service: "Standard",
        },
        {
          country: "SK",
          price: "0.00 HUF",
          service: "Standard",
        },
        {
          country: "CZ",
          price: "0.00 HUF",
          service: "Standard",
        },
      ]);
    });
  });
});
