# Admin pagination prefetch

## Decision and scope
Keep the native Medusa table and its existing query cache. A non-visual product-list widget subscribes to successful active page queries and prefetches immediate neighbors. Filters, sorting, field selection and the 90-second dashboard freshness default remain unchanged. No dependency, API, schema or product-data changes.

The query key contract was checked in the installed dashboard 2.13.2 query-key factory and in the live React Query cache: `["products", "list", { query: params }]`. For example offset 300 with limit 20 prefetches offsets 280 and 320. Search suggestions lack offset and the route loader lacks fields; neither qualifies. Inactive results cannot recursively prefetch the catalogue. Speculative errors are swallowed by TanStack prefetchQuery and do not replace the current page.

## Verification (2026-09-19)
- Baseline, live admin at offset 300: three Next click-to-first-row changes took 325, 287, 202 ms. Cached Prev: 102, 74 ms. Initial page API: 1042 ms; subsequent APIs: 200, 157, 127 ms.
- Browser-local trial of the compiled helper against the live dashboard query client: five Next changes took 91, 74, 94, 125, 82 ms. The trial's authenticated read adapter used the same query parameters; the shipped widget uses the Medusa SDK. Waited for neighbor prefetch before each click. This demonstrates ready-cache behavior, not a guarantee during rapid clicking or slow connections.
- Trial listener explicitly removed afterwards. No server state changed during measurements.
- 10 targeted tests passed, covering boundaries, filters, no recursive fetch, warm mount, cache reuse, invalidation, failures and cleanup.
- Full unit suite: 34 suites, 229 tests passed.
- Medusa production backend and admin builds passed.
- Strict admin typecheck reports the pre-existing unused `sourceDescriptionHu` in `product-localized-descriptions.tsx:97`; all admin types pass with only `noUnusedLocals` disabled. No type error in touched files. Existing unused code is intentionally outside scope.

## Release verification
Deliver via PR. After deployment, reload the admin to remove trial state, verify the compiled widget in the deployed bundle, then measure navigation and confirm neighboring API requests occur before clicking. Confirm filters and row counts remain intact.
