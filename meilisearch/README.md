# Meilisearch — TehergumiNet termékkereső

| Rész | Hol | Mit csinál |
| --- | --- | --- |
| `@rokmohar/medusa-plugin-meilisearch@1.3.6` | backend | Indexeli a published termékeket, subscriberekkel élesben szinkronban tartja |
| `src/lib/meilisearch-products.ts` | backend | Dokumentum-alak + index-beállítások (gumiméret-tokenek: `size_tokens`) |
| `src/lib/search/meilisearch.ts` | storefront | Szerveroldalon, search-only kulccsal kérdezi az indexet (`/api/suggest`, `/store?q=`) |

Ha az env nincs beállítva (backend: `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY`,
storefront: `MEILISEARCH_HOST` + `MEILISEARCH_SEARCH_KEY`), a plugin nem töltődik be,
és a storefront a régi Medusa `q` keresést használja. Ugyanez történik, ha a
Meilisearch 2,5 mp-en belül nem válaszol: a kereső nem törik el.

> Az 1.3.6-os plugin azért, mert az 1.3.7+ már `@medusajs/framework ^2.13.4`-et kér,
> ez a backend pedig 2.13.2-n fut.

## Első éles telepítés (Coolify, VPS 2.24.161.87)

1. **DNS**: `search.teherguminet.hu` → `A` → `2.24.161.87` (Hostinger DNS, a zóna többi rekordja marad).
2. **Master key**: `openssl rand -base64 48`
3. **Coolify app** (a koronakert-meilisearch mintájára, `dockerimage`):
   image `getmeili/meilisearch:v1.53`, port `7700`, FQDN `https://search.teherguminet.hu`,
   persistent storage → `/meili_data`, env:
   `MEILI_MASTER_KEY`, `MEILI_ENV=production`, `MEILI_NO_ANALYTICS=true`, `MEILI_DB_PATH=/meili_data`.
   (Alternatíva: `docker-compose.yml` ebben a mappában, Docker Compose resource-ként.)
4. **Kulcsok**: `GET /keys` a master key-jel →
   `Default Admin API Key` a backendbe, `Default Search API Key` a storefrontba. A master key sehova nem kerül.
5. **Backend env** (`coolify app env update f3veb7tb1cj9n8k8euw16i37 …`), majd redeploy:
   `MEILISEARCH_HOST=https://search.teherguminet.hu`, `MEILISEARCH_API_KEY=<admin key>`.
   Induláskor a `meilisearch-products-index` job feltölti az indexet (~3,6k termék).
   A subscriberek és a job csak `shared`/`worker` módban futnak.
6. **Storefront env** (Hostinger Node.js, `u431956838` / `teherguminet.hu`):
   `MEILISEARCH_HOST`, `MEILISEARCH_SEARCH_KEY`. A Hostinger env-csere teljes felülírás —
   a meglévő változókat is küldeni kell valódi értékkel. Utána új build.

Ellenőrzés: `curl -H "Authorization: Bearer $ADMIN_KEY" https://search.teherguminet.hu/indexes/products/stats`

## Mért eredmény (helyi Meilisearch, mind a 3635 éles termék, 2026-11-02)

| Lekérdezés | Régi `/api/suggest` (élő) | Meilisearch |
| --- | --- | --- |
| `385/65 r22.5` | 13–18 s (9 s-nál a kliens feladja) | 4–8 ms, 6 találat (mind a 6 ilyen méretű termék) |
| `315/80` | ~0,6–0,7 s meleg, 6–9 s hidegen | 4 ms |
| `michelin` | ~0,6 s | 4 ms |
