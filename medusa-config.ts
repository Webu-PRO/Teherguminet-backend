import { loadEnv, defineConfig } from "@medusajs/utils";
import fs from "fs";
import path from "path";

const DEFAULT_STORE_CORS = [
  "http://localhost:8000",
  "https://teherguminet.hu",
  "https://www.teherguminet.hu",
];

const DEFAULT_ADMIN_CORS = [
  "http://localhost:5173",
  "http://localhost:9000",
  "https://admin.teherguminet.hu",
];

const DEFAULT_AUTH_CORS = [
  ...DEFAULT_ADMIN_CORS,
  "https://teherguminet.hu",
  "https://www.teherguminet.hu",
  "http://localhost:8000",
];

const formatCors = (value: string | undefined, defaults: string[]) => {
  if (value?.trim()) {
    return value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .join(",");
  }

  return Array.from(new Set(defaults)).join(",");
};

const normalizeAdminPath = (value?: string) => {
  const trimmed = value?.trim();
  if (trimmed) {
    return (trimmed.startsWith("/") ? trimmed : `/${trimmed}`) as `/${string}`;
  }

  return "/app" as `/${string}`;
};

loadEnv(process.env.NODE_ENV || "development", process.cwd());

const firstNonEmptyEnv = (...values: Array<string | undefined>) => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
};

const eventBusRedisUrl = firstNonEmptyEnv(
  process.env.EVENT_BUS_REDIS_URL,
  process.env.EVENTS_REDIS_URL,
);
const sharedRedisUrl = firstNonEmptyEnv(process.env.REDIS_URL, eventBusRedisUrl);
const normalizeS3Prefix = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.replace(/^\/+|\/+$/g, "");
  return trimmed ? trimmed : undefined;
};
const s3Prefix = normalizeS3Prefix(process.env.S3_PREFIX);
const resolveOptionalNumber = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const s3DownloadDuration = resolveOptionalNumber(
  process.env.S3_DOWNLOAD_FILE_DURATION,
);
const s3AdditionalClientConfig =
  process.env.S3_CUSTOM_AGENT && process.env.S3_CUSTOM_AGENT.trim().length > 0
    ? {
        customUserAgent: process.env.S3_CUSTOM_AGENT.trim(),
      }
    : undefined;
const notificationProviders: Array<Record<string, unknown>> = [
  {
    resolve: "@medusajs/notification-local",
    id: "local",
    options: {
      channels: ["feed"],
    },
  },
];

const hasResendConfig =
  Boolean(process.env.RESEND_API_KEY) && Boolean(process.env.RESEND_FROM_EMAIL);

const parseResendTemplateIdsJson = () => {
  const raw = process.env.RESEND_TEMPLATE_IDS_JSON?.trim();
  if (!raw) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized = Object.entries(parsed).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        if (typeof value === "string" && value.trim().length > 0) {
          acc[key] = value.trim();
        }
        return acc;
      },
      {}
    );
    return normalized;
  } catch {
    return {} as Record<string, string>;
  }
};

const parseResendTemplateIdsFile = () => {
  const filePath = process.env.RESEND_TEMPLATE_IDS_FILE?.trim()
    ? path.resolve(process.cwd(), process.env.RESEND_TEMPLATE_IDS_FILE.trim())
    : path.resolve(process.cwd(), ".resend-template-ids.json");

  if (!fs.existsSync(filePath)) {
    return {} as Record<string, string>;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized = Object.entries(parsed).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        if (typeof value === "string" && value.trim().length > 0) {
          acc[key] = value.trim();
        }
        return acc;
      },
      {}
    );
    return normalized;
  } catch {
    return {} as Record<string, string>;
  }
};

const resolveResendTemplateIds = () => {
  const fromFile = parseResendTemplateIdsFile();
  const fromJson = parseResendTemplateIdsJson();
  const fromEnv = {
    "order-placed": process.env.RESEND_TEMPLATE_ID_ORDER_PLACED,
    "order-thanks": process.env.RESEND_TEMPLATE_ID_ORDER_THANKS,
    "order-delivered": process.env.RESEND_TEMPLATE_ID_ORDER_DELIVERED,
    "order-pickup-ready": process.env.RESEND_TEMPLATE_ID_ORDER_PICKUP_READY,
    "order-pickup-completed":
      process.env.RESEND_TEMPLATE_ID_ORDER_PICKUP_COMPLETED,
    "order-pickup-cancelled":
      process.env.RESEND_TEMPLATE_ID_ORDER_PICKUP_CANCELLED,
    "own-delivery-payment-notice":
      process.env.RESEND_TEMPLATE_ID_OWN_DELIVERY_PAYMENT_NOTICE,
    "own-delivery-shipped":
      process.env.RESEND_TEMPLATE_ID_OWN_DELIVERY_SHIPPED,
    "own-delivery-delivered":
      process.env.RESEND_TEMPLATE_ID_OWN_DELIVERY_DELIVERED,
    "payment-receipt": process.env.RESEND_TEMPLATE_ID_PAYMENT_RECEIPT,
    "user-invited": process.env.RESEND_TEMPLATE_ID_USER_INVITED,
    "abandoned-cart": process.env.RESEND_TEMPLATE_ID_ABANDONED_CART,
    "password-reset": process.env.RESEND_TEMPLATE_ID_PASSWORD_RESET,
    "gls-label-cancelled": process.env.RESEND_TEMPLATE_ID_GLS_LABEL_CANCELLED,
    "order-items-cancelled":
      process.env.RESEND_TEMPLATE_ID_ORDER_ITEMS_CANCELLED,
    "gls-shipment-created": process.env.RESEND_TEMPLATE_ID_GLS_SHIPMENT_CREATED,
  };

  const normalizedFromEnv = Object.entries(fromEnv).reduce<
    Record<string, string>
  >((acc, [key, value]) => {
    if (typeof value === "string" && value.trim().length > 0) {
      acc[key] = value.trim();
    }
    return acc;
  }, {});

  return { ...fromFile, ...fromJson, ...normalizedFromEnv };
};

if (hasResendConfig) {
  const resendOptions: Record<string, unknown> = {
    channels: ["email"],
    api_key: process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM_EMAIL,
  };

  if (process.env.RESEND_FROM_NAME?.trim()) {
    resendOptions.from_name = process.env.RESEND_FROM_NAME.trim();
  }

  if (process.env.RESEND_REPLY_TO?.trim()) {
    resendOptions.reply_to = process.env.RESEND_REPLY_TO.trim();
  }

  const templateIds = resolveResendTemplateIds();
  if (Object.keys(templateIds).length > 0) {
    resendOptions.template_ids = templateIds;
  }

  notificationProviders.push({
    resolve: "./src/modules/resend",
    id: "resend",
    options: resendOptions,
  });
}

module.exports = defineConfig({
  admin: {
    path: normalizeAdminPath(process.env.ADMIN_PATH),
    // @ts-expect-error Admin bundler supports sources but AdminOptions typing is stale.
    sources: [path.resolve(process.cwd(), "src/admin")],
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: sharedRedisUrl,
    http: {
      storeCors: formatCors(process.env.STORE_CORS, DEFAULT_STORE_CORS),
      adminCors: formatCors(process.env.ADMIN_CORS, DEFAULT_ADMIN_CORS),
      authCors: formatCors(process.env.AUTH_CORS, DEFAULT_AUTH_CORS),
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
    databaseDriverOptions: {
      ssl: false,
      sslmode: "disable",
    },
  },
  modules: {
    order: {},
    b2b: {
      resolve: "./src/modules/b2b",
    },
    productLocalization: {
      resolve: "./src/modules/product-localization",
    },
    fulfillment: {
      resolve: "@medusajs/fulfillment",
      options: {
        providers: [
          {
            resolve: "./src/modules/fulfillment-manual",
            id: "manual",
          },
          {
            resolve: "./src/modules/fulfillment-manual",
            id: "teherguminet",
            options: {
              price_per_kg: 40,
              weight_unit: "kg",
            },
          },
          {
            resolve: "./src/modules/fulfillment-gls",
            id: "gls",
          },
          {
            resolve: "./src/modules/fulfillment-magyar-posta",
            id: "magyar-posta",
          },
          {
            resolve: "./src/modules/fulfillment-tomket",
            id: "tomket",
          },
        ],
      },
    },
    payment: {
      resolve: "@medusajs/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/payment-manual",
            id: "manual",
          },
          {
            resolve: "@medusajs/payment-stripe",
            id: "stripe",
            options: {
              apiKey: process.env.STRIPE_API_KEY,
              webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
              // Capture Stripe payment intents immediately instead of manual capture
              capture: true,
              // Ensure Stripe automatically selects available payment methods
              automaticPaymentMethods: true,
            },
          },
        ],
      },
    },
    file: {
      resolve: "@medusajs/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/file-s3",
            id: "s3",
            options: {
              authentication_method: "access-key",
              file_url: process.env.S3_URL,
              bucket: process.env.S3_BUCKET,
              region: process.env.S3_REGION,
              access_key_id: process.env.S3_ACCESS_KEY_ID,
              secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
              cache_control: process.env.S3_CACHE_CONTROL,
              ...(s3DownloadDuration
                ? { download_file_duration: s3DownloadDuration }
                : {}),
              ...(s3Prefix ? { prefix: `${s3Prefix}/` } : {}),
              ...(s3AdditionalClientConfig
                ? { additional_client_config: s3AdditionalClientConfig }
                : {}),
            },
          },
        ],
      },
    },
    eventBus: {
      resolve: "@medusajs/event-bus-redis",
      options: {
        redisUrl: eventBusRedisUrl || sharedRedisUrl,
      },
    },
    invoinve: {
      resolve: "./src/modules/invoice-generator",
    },
    notification: {
      resolve: "@medusajs/notification",
      options: {
        providers: notificationProviders,
      },
    },
  },
  plugins: [
    {
      // Google Maps lead scraping: module, admin page, API routes and the
      // polling job. Its modules register themselves, so nothing goes in
      // `modules`.
      //
      // The scraper service it talks to runs as its own project, shared with
      // the other shops on this host. SCRAPER_URL needs no value: the plugin
      // defaults to http://gmaps-scraper:8080, which is the network alias that
      // shared service registers — verified reachable from this backend.
      resolve: "@webupro/medusa-scraper",
      options: {},
    },
    {
      // SEO scoring: a Rank Math-style score and checklist on the product
      // page, a catalogue-wide worst-first list, and the /admin/seo-score
      // routes behind both. Built on @power-seo/content-analysis.
      //
      // Configured through POWER_SEO_* environment variables rather than the
      // options below — the plugin registers no module, and Medusa forwards
      // plugin options to a plugin's modules. This shop needs:
      //   POWER_SEO_STOREFRONT_URL=https://teherguminet.hu
      //   POWER_SEO_SOURCE_LOCALE=hu
      //   POWER_SEO_BRAND_SUFFIX=| TehergumiNet
      //   POWER_SEO_ADMIN_LANG=hu
      //
      // Deliberately single-locale for now. The plugin reads locale overlays
      // from a translations module shaped as (resource, locale, field, value)
      // rows; this shop's `productLocalization` module is a wide table
      // (title_hu / title_sk / description_hu / description_sk) with no
      // per-locale SEO fields, so no overlay matches and only the Hungarian
      // source copy is graded. That degrades cleanly — it does not error — and
      // POWER_SEO_LOCALES stays unset until the plugin grows a wide-table
      // overlay strategy.
      resolve: "@webupro/medusa-power-seo",
      options: {},
    },
    {
      resolve: "@rsc-labs/medusa-store-analytics-v2",
      options: {},
    },
    {
      resolve: "@alpha-solutions/medusa-image-alt",
      options: {},
    },
  ],
  auth: {
    customer: {
      strategies: {
        emailpass: {
          enabled: true,
        },
      },
    },
  },
});
