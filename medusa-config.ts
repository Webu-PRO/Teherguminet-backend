import { loadEnv, defineConfig } from "@medusajs/utils";

const DEFAULT_STORE_CORS = [
  "http://localhost:8000",
  "https://therguminet.hu",
  "https://www.therguminet.hu",
];

const DEFAULT_ADMIN_CORS = [
  "http://localhost:5173",
  "http://localhost:9000",
  "https://admin.teherguminet.hu",
];

const DEFAULT_AUTH_CORS = [
  ...DEFAULT_ADMIN_CORS,
  "https://therguminet.hu",
  "https://www.therguminet.hu",
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

loadEnv(process.env.NODE_ENV || "development", process.cwd());

const sharedRedisUrl = process.env.REDIS_URL;
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
  process.env.S3_DOWNLOAD_FILE_DURATION
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

if (hasResendConfig) {
  notificationProviders.push({
    resolve: "./src/modules/resend",
    id: "resend",
    options: {
      channels: ["email"],
      api_key: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM_EMAIL,
    },
  });
}

module.exports = defineConfig({
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
    payment: {
      resolve: "@medusajs/payment",
      options: {
        providers: [
          {
            resolve: "@medusajs/payment-stripe",
            id: "stripe",
            options: {
              apiKey: process.env.STRIPE_API_KEY,
              webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
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
        redisUrl: process.env.EVENT_BUS_REDIS_URL || sharedRedisUrl,
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
  // @ts-expect-error Auth configuration isn't typed in the current Medusa release
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
