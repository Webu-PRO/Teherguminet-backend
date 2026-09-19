## ADDED Requirements

### Requirement: Adjacent page prefetch
The admin product list SHALL prefetch only valid immediate neighbor pages of a successfully loaded active paginated product query, preserving all query parameters except offset and using the dashboard query cache.

#### Scenario: Middle page
- **WHEN** a product page with offset 300, limit 20 and count 3542 finishes loading
- **THEN** offsets 280 and 320 are prefetched with identical filters and fields
- **AND** inactive prefetch results do not trigger further prefetches

#### Scenario: Bounds and other queries
- **WHEN** the first or final product page loads, or a non-paginated search query completes
- **THEN** no negative, out-of-range or non-paginated neighbor request is made

### Requirement: Existing cache behavior
Prefetch SHALL retain the dashboard's cache keys, freshness and mutation invalidation semantics, and SHALL NOT prevent navigation on prefetch failure.

#### Scenario: Freshness and invalidation
- **WHEN** a neighbor is fresh in cache
- **THEN** prefetch does not duplicate its request
- **WHEN** product list queries are invalidated and the active page reloads
- **THEN** its neighbors can be refreshed

#### Scenario: Widget unmount
- **WHEN** the product list widget unmounts
- **THEN** its cache subscription is removed
