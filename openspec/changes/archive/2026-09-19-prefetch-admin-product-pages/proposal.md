# Prefetch adjacent admin product pages

## Why
Live click-to-table measurements at offset 300 show uncached Next transitions of 202–325 ms versus cached Prev transitions of 74–102 ms. Requests start only after clicking.

## What Changes
Prefetch only the adjacent valid pages after the active product table finishes loading, using the dashboard's existing query cache and exact filters/fields. Preserve its freshness and mutation invalidation behavior. No backend, schema, product data or table UI changes.

## Impact
Admin product-list widget and targeted cache integration tests. At most two speculative page reads per active page; no recursive catalogue download.
