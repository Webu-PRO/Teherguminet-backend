<p align="center">
  <a href="https://www.medusajs.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/59018053/229103275-b5e482bb-4601-46e6-8142-244f531cebdb.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    <img alt="Medusa logo" src="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    </picture>
  </a>
</p>
<h1 align="center">
  Medusa
</h1>

<h4 align="center">
  <a href="https://docs.medusajs.com">Documentation</a> |
  <a href="https://www.medusajs.com">Website</a>
</h4>

<p align="center">
  Building blocks for digital commerce
</p>
<p align="center">
  <a href="https://github.com/medusajs/medusa/blob/master/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs welcome!" />
  </a>
    <a href="https://www.producthunt.com/posts/medusa"><img src="https://img.shields.io/badge/Product%20Hunt-%231%20Product%20of%20the%20Day-%23DA552E" alt="Product Hunt"></a>
  <a href="https://discord.gg/xpCwq3Kfn8">
    <img src="https://img.shields.io/badge/chat-on%20discord-7289DA.svg" alt="Discord Chat" />
  </a>
  <a href="https://twitter.com/intent/follow?screen_name=medusajs">
    <img src="https://img.shields.io/twitter/follow/medusajs.svg?label=Follow%20@medusajs" alt="Follow @medusajs" />
  </a>
</p>

## Compatibility

This starter is compatible with versions >= 2 of `@medusajs/medusa`.

## Getting Started

Visit the [Quickstart Guide](https://docs.medusajs.com/learn/installation) to set up a server.

Visit the [Docs](https://docs.medusajs.com/learn/installation#get-started) to learn more about our system requirements.

## Deployment Configuration

If you deploy the backend on `https://admin.teherguminet.hu` (for example through Coolify) while serving the storefront from `https://teherguminet.hu`, configure the following environment variables before starting the server:

- `STORE_CORS=http://localhost:8000,https://teherguminet.hu,https://www.teherguminet.hu`
- `ADMIN_CORS=http://localhost:5173,http://localhost:9000,https://admin.teherguminet.hu`
- `AUTH_CORS=http://localhost:5173,http://localhost:9000,https://admin.teherguminet.hu,https://teherguminet.hu,https://www.teherguminet.hu`

Coolify exposes a “Environment Variables” panel per service—add or update the variables there so the values propagate to the container. The project now falls back to these domains automatically when the variables are omitted, so you can keep local origins for development and append production URLs separated by commas as needed.


## Product Feed for Meta & Google

The backend exposes a product feed endpoint that is compatible with Meta and Google catalog ingestion:

- `GET /product-feed?currency_code=eur&country_code=hu`
- `GET /local-inventory-feed?currency_code=eur&country_code=hu`

Requirements:

- Set `PRODUCT_FEED_STOREFRONT_URL` (recommended), `admin.storefrontUrl`, or `STOREFRONT_URL`.
- If none of the above is set, the feed falls back to the first non-localhost origin in `STORE_CORS`.
- The storefront URL must be absolute (for example `https://teherguminet.hu`).
- Optional feed tuning:
  - `PRODUCT_FEED_LINK_BASE_URL` (override product-page domain in `<link>` when Merchant requires exact canonical domain, for example `https://www.teherguminet.hu`)
  - `PRODUCT_FEED_SHIPPING_COUNTRIES` (comma-separated ISO country codes, for example `HU,SK`, to emit shipping blocks for multiple countries from one feed)
  - `PRODUCT_FEED_LOCAL_INVENTORY_STORE_CODES` (comma-separated Google Business Profile store codes for local inventory feed, for example `HU001,HU002`; values must be alphanumeric and must exactly match Business Profile store codes)
  - `PRODUCT_FEED_LOCAL_INVENTORY_STORE_CODES_<COUNTRY_CODE>` (country-specific override, for example `PRODUCT_FEED_LOCAL_INVENTORY_STORE_CODES_HU=HU001`)
  - `PRODUCT_FEED_DEFAULT_SHIPPING_PRICE` (defaults to `0`)
  - `PRODUCT_FEED_SHIPPING_SERVICE` (defaults to `Standard`)
  - `PRODUCT_FEED_BACKORDER_DAYS` (defaults to `14`)

The endpoint returns `application/rss+xml` and includes product-variant feed items with availability and price fields.

Default-variant dimension backfill on deploy:

- Enable `RUN_VARIANTS_BACKFILL_DEFAULT_DIMENSIONS=true` to auto-run `variants:backfill-default-dimensions -- --apply` during backend startup.
- Optional: set `RUN_VARIANTS_BACKFILL_FAIL_ON_ERROR=true` to fail startup if the backfill command fails.
- Backfill is idempotent: it only fills missing (`null`/`0`) default-variant `weight`/`width`/`height` from matching inventory-item SKU dimensions.

## Email Delivery (Resend)

This backend exclusively uses the custom Resend notification provider defined in `medusa-config.ts`. To avoid silent delivery failures:

- Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in the backend environment. The `from` address must belong to a domain that is verified in the Resend dashboard.
- Optionally set `RESEND_FROM_NAME` for a branded sender label and `RESEND_REPLY_TO` if replies should land in a monitored inbox.
- Remove any obsolete SMTP or SendGrid variables when deploying—Medusa won’t read them, and leaving them behind can cause confusion when debugging.
- After updating the environment, restart the backend so the notification provider registry is synced and the new credentials are used for order confirmations and invoices.

Every `order.placed` event now creates a notification linked to the order in Medusa, so you can audit the sent emails directly from the admin UI.

## Store Analytics Plugin (`@rsc-labs/medusa-store-analytics-v2`)

Medusa store-analytics is a plugin that shows analytics data for your store, including orders, sales, customers, products, and marketing insights.

### Why?

Knowledge about your store is crucial to take proper action and increase sales. Analytics data can show, for example, the most popular region or sales channel, and on which days customers buy the most. These insights can help identify problems and possible solutions.

### Getting Started

#### Plugin System

1. Add the plugin to `package.json`:

```json
{
  "dependencies": {
    "@rsc-labs/medusa-store-analytics-v2": "0.1.3"
  }
}
```

Then install dependencies, for example:

```bash
yarn install
```

2. Add the plugin to `medusa-config.ts` (or `medusa-config.js`):

```ts
plugins: [
  {
    resolve: "@rsc-labs/medusa-store-analytics-v2",
    options: {},
  },
]
```

#### Copy The Code (`/src`) Option

You can also copy the code from `/src` into your Medusa project and load it as a local module in `medusa-config.ts` / `medusa-config.js`:

```ts
{
  resolve: "./modules/store-analytics",
}
```

If you copy the code, add these dependencies to `package.json`:

```json
{
  "dependencies": {
    "@medusajs/icons": "^2.1.3",
    "@mui/material": "^6.1.2",
    "react-hook-form": "^7.53.0",
    "@emotion/react": "^11.13.3",
    "@emotion/styled": "^11.13.0",
    "pdfkit": "^0.15.1",
    "recharts": "^2.13.3"
  }
}
```

### How Can I Use It?

After installing the plugin, a new `Analytics` option appears in the admin sidebar. Open it to explore store data.

_Medusa store-analytics-1_

> Warning: Depending on the number of orders, customers, and other records, wider ranges like `Last year` or `All time` may take longer to load.

### Configuration

No configuration is required in code. Everything is controlled through the UI, including:

- Date range selection
- Order status filters used in calculations
- Enabling/disabling comparison mode

### Supported Statistics

_Medusa store-analytics-2_

#### General

| Name | Status |
| --- | --- |
| 4 ranges of dates | ✅ |
| Comparison across date ranges | ✅ |
| Filtering by orders' status | ✅ |

#### Orders

| Name | Status |
| --- | --- |
| Orders by time | ✅ |
| Orders chart | ✅ |
| Regions popularity | ✅ |
| Sales channel popularity | ✅ |
| Orders frequency distribution | ✅ |
| Payment provider popularity | ✅ |

#### Sales

| Name | Status |
| --- | --- |
| Sales by time | ✅ |
| Sales by currency code | ✅ |
| Sales chart | ✅ |
| Refunds | ✅ |

#### Customers

| Name | Status |
| --- | --- |
| New customers by time | ✅ |
| Repeat customer rate | ✅ |
| Customers chart | ✅ |
| Cumulative customers by time | ✅ |

#### Products

| Name | Status |
| --- | --- |
| Top variants | ✅ |
| Top returned variants | ✅ |
| Products sold count | ✅ |
| Out of stock variants | BETA |

#### Marketing

| Name | Status |
| --- | --- |
| Top discounts | ✅ |

### License

MIT

### Pro Version

The Pro version of medusa-store-analytics expands on the free version with advanced capabilities such as:

- Customizable dashboard (build your own dashboard with selected statistics)
- Date range picker (choose any exact period)
- 15+ advanced statistics (funnels, deeper promotion insights, and granular channel analytics)

The Pro version is available under a commercial license. Contact `labs@rsoftcon.com` for more information.

### Hide Pro Version Tab

To hide the `Pro version` tab in admin, set:

```bash
VITE_MEDUSA_ADMIN_MEDUSA_STORE_ANALYTICS_HIDE_PRO=true
```

Restart the admin application after setting this variable.

© 2024 RSC https://rsoftcon.com/

## What is Medusa

Medusa is a set of commerce modules and tools that allow you to build rich, reliable, and performant commerce applications without reinventing core commerce logic. The modules can be customized and used to build advanced ecommerce stores, marketplaces, or any product that needs foundational commerce primitives. All modules are open-source and freely available on npm.

Learn more about [Medusa’s architecture](https://docs.medusajs.com/learn/introduction/architecture) and [commerce modules](https://docs.medusajs.com/learn/fundamentals/modules/commerce-modules) in the Docs.

## Community & Contributions

The community and core team are available in [GitHub Discussions](https://github.com/medusajs/medusa/discussions), where you can ask for support, discuss roadmap, and share ideas.

Join our [Discord server](https://discord.com/invite/medusajs) to meet other community members.

## Other channels

- [GitHub Issues](https://github.com/medusajs/medusa/issues)
- [Twitter](https://twitter.com/medusajs)
- [LinkedIn](https://www.linkedin.com/company/medusajs)
- [Medusa Blog](https://medusajs.com/blog/)
