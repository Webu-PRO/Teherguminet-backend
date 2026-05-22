#!/usr/bin/env node
/**
 * teherguminet admin MCP — read-only window into the live Medusa v2 admin API.
 *
 * Auth: if MEDUSA_ADMIN_TOKEN is set, use it as the bearer. Otherwise
 *       sign in with MEDUSA_ADMIN_EMAIL+MEDUSA_ADMIN_PASSWORD against
 *       POST /auth/user/emailpass and cache the JWT in-memory. On 401,
 *       refresh the JWT once and retry.
 *
 * Secrets live in `apps/backend/mcp/.env` (gitignored). Never paste tokens
 * into chat — see memory observation 7019.
 *
 * Transport: stdio. Registered in ~/.claude-accounts/account2/settings.json.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotenv(path: string): void {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotenv(resolve(__dirname, '.env'));

const BACKEND_URL = (process.env.MEDUSA_BACKEND_URL ?? 'https://admin.teherguminet.hu').replace(
  /\/+$/,
  '',
);
const ADMIN_EMAIL = process.env.MEDUSA_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.MEDUSA_ADMIN_PASSWORD;
const STATIC_TOKEN = process.env.MEDUSA_ADMIN_TOKEN;
const TIMEOUT_MS = Number(process.env.MEDUSA_MCP_TIMEOUT_MS ?? 15000);

let cachedToken: string | null = STATIC_TOKEN ?? null;

async function login(): Promise<string> {
  if (STATIC_TOKEN) return STATIC_TOKEN;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      'Missing auth: set MEDUSA_ADMIN_TOKEN, or both MEDUSA_ADMIN_EMAIL and MEDUSA_ADMIN_PASSWORD in apps/backend/mcp/.env',
    );
  }
  const res = await fetchWithTimeout(`${BACKEND_URL}/auth/user/emailpass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${res.statusText} — ${await res.text()}`);
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error('Login response missing token field');
  cachedToken = data.token;
  return data.token;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function adminRequest<T = unknown>(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<T> {
  const token = cachedToken ?? (await login());
  const headers = {
    accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
    authorization: `Bearer ${token}`,
  };
  const url = path.startsWith('http') ? path : `${BACKEND_URL}${path}`;
  const res = await fetchWithTimeout(url, { ...init, headers });
  if (res.status === 401 && !retried && !STATIC_TOKEN) {
    cachedToken = null;
    await login();
    return adminRequest<T>(path, init, true);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function qs(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((item) => usp.append(k, String(item)));
    else usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

const numProp = (description: string) => ({ type: 'number', description });
const strProp = (description: string) => ({ type: 'string', description });

const paginationProps = {
  limit: numProp('Page size, default 20, max 100'),
  offset: numProp('Offset for pagination, default 0'),
};

const tools: ToolDef[] = [
  {
    name: 'whoami',
    description:
      'Confirm MCP can authenticate against the Medusa admin API and return the authenticated user.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const data = await adminRequest<{ user: unknown }>('/admin/users/me');
      return { backend_url: BACKEND_URL, ...data };
    },
  },
  {
    name: 'dashboard_snapshot',
    description:
      "Quick 'realtime' overview: recent orders count + revenue, latest 5 orders, low-stock inventory count, draft-order count. Hits multiple admin endpoints in parallel.",
    inputSchema: {
      type: 'object',
      properties: {
        since_hours: numProp('How many hours back to count orders. Default 24.'),
      },
    },
    handler: async (args) => {
      const sinceHours = Number(args.since_hours ?? 24);
      const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();
      const [recentOrders, draftOrders, lowStock] = await Promise.all([
        adminRequest<{ orders: any[]; count: number }>(
          `/admin/orders${qs({ limit: 5, order: '-created_at', 'created_at[$gte]': since })}`,
        ),
        adminRequest<{ count: number }>(`/admin/draft-orders${qs({ limit: 1 })}`),
        adminRequest<{ count: number }>(
          `/admin/inventory-items${qs({ limit: 1, 'stocked_quantity[$lte]': 5 })}`,
        ),
      ]);
      const revenue = recentOrders.orders.reduce(
        (sum, o: any) => sum + Number(o?.total ?? 0),
        0,
      );
      return {
        window_hours: sinceHours,
        since,
        recent_orders: {
          count_in_window: recentOrders.count,
          revenue_in_window: revenue,
          latest: recentOrders.orders.map((o: any) => ({
            id: o.id,
            display_id: o.display_id,
            email: o.email,
            total: o.total,
            currency_code: o.currency_code,
            status: o.status,
            payment_status: o.payment_status,
            fulfillment_status: o.fulfillment_status,
            created_at: o.created_at,
          })),
        },
        draft_orders_total: draftOrders.count,
        low_stock_items_total: lowStock.count,
      };
    },
  },
  {
    name: 'list_orders',
    description: 'List orders, newest first. Supports filtering by status, payment_status, date range, q (email/display_id), and customer_id.',
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationProps,
        q: strProp('Free-text search (matches email, display_id)'),
        status: strProp("Order status, e.g. 'pending', 'completed', 'archived', 'canceled'"),
        payment_status: strProp("Payment status, e.g. 'captured', 'awaiting'"),
        fulfillment_status: strProp("Fulfillment status, e.g. 'fulfilled', 'shipped'"),
        customer_id: strProp('Filter to a specific customer id'),
        created_after: strProp('ISO datetime — only orders created at/after'),
        created_before: strProp('ISO datetime — only orders created at/before'),
      },
    },
    handler: async (args) => {
      const params: Record<string, unknown> = {
        limit: args.limit ?? 20,
        offset: args.offset ?? 0,
        order: '-created_at',
        q: args.q,
        status: args.status,
        payment_status: args.payment_status,
        fulfillment_status: args.fulfillment_status,
        customer_id: args.customer_id,
        'created_at[$gte]': args.created_after,
        'created_at[$lte]': args.created_before,
      };
      return adminRequest(`/admin/orders${qs(params)}`);
    },
  },
  {
    name: 'get_order',
    description: 'Fetch a single order by id, including items, shipping_address, payments, fulfillments.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: strProp('Order id (e.g. order_01H…)'),
        fields: strProp(
          "Comma-separated field expansion (Medusa v2 'fields' query). Optional.",
        ),
      },
    },
    handler: async (args) => {
      const path = `/admin/orders/${encodeURIComponent(String(args.id))}${qs({ fields: args.fields })}`;
      return adminRequest(path);
    },
  },
  {
    name: 'list_draft_orders',
    description: 'List draft orders (orders being composed by an admin).',
    inputSchema: {
      type: 'object',
      properties: { ...paginationProps, q: strProp('Free-text search') },
    },
    handler: async (args) =>
      adminRequest(
        `/admin/draft-orders${qs({ limit: args.limit ?? 20, offset: args.offset ?? 0, q: args.q })}`,
      ),
  },
  {
    name: 'list_products',
    description: 'List products with filters. Use this to debug catalog issues like the 404 on click obs.',
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationProps,
        q: strProp('Free-text search across title/description/handle'),
        status: strProp("Product status: 'draft' | 'proposed' | 'published' | 'rejected'"),
        handle: strProp('Exact handle to filter by'),
        collection_id: strProp('Filter by collection id'),
        category_id: strProp('Filter by category id'),
      },
    },
    handler: async (args) =>
      adminRequest(
        `/admin/products${qs({
          limit: args.limit ?? 20,
          offset: args.offset ?? 0,
          q: args.q,
          status: args.status,
          handle: args.handle,
          collection_id: args.collection_id,
          category_id: args.category_id,
          order: '-updated_at',
        })}`,
      ),
  },
  {
    name: 'get_product',
    description: 'Fetch a single product. Accepts either id or handle.',
    inputSchema: {
      type: 'object',
      properties: {
        id: strProp('Product id (prod_…)'),
        handle: strProp("Product handle (used as URL slug, e.g. 'continental-205-55-r16')"),
        fields: strProp('Comma-separated field expansion. Optional.'),
      },
    },
    handler: async (args) => {
      if (args.id) {
        return adminRequest(
          `/admin/products/${encodeURIComponent(String(args.id))}${qs({ fields: args.fields })}`,
        );
      }
      if (args.handle) {
        const res = await adminRequest<{ products: any[] }>(
          `/admin/products${qs({ handle: args.handle, limit: 1, fields: args.fields })}`,
        );
        return { product: res.products?.[0] ?? null };
      }
      throw new Error('Provide either id or handle');
    },
  },
  {
    name: 'list_inventory_items',
    description: 'List inventory items with optional q/sku filter and low-stock threshold.',
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationProps,
        q: strProp('Free-text search (title, sku)'),
        sku: strProp('Exact SKU filter'),
        max_stocked_quantity: numProp('Return only items at/below this stocked_quantity'),
      },
    },
    handler: async (args) => {
      const params: Record<string, unknown> = {
        limit: args.limit ?? 20,
        offset: args.offset ?? 0,
        q: args.q,
        sku: args.sku,
      };
      if (args.max_stocked_quantity !== undefined) {
        params['stocked_quantity[$lte]'] = args.max_stocked_quantity;
      }
      return adminRequest(`/admin/inventory-items${qs(params)}`);
    },
  },
  {
    name: 'list_stock_locations',
    description: 'List stock locations (warehouses).',
    inputSchema: { type: 'object', properties: paginationProps },
    handler: async (args) =>
      adminRequest(
        `/admin/stock-locations${qs({ limit: args.limit ?? 50, offset: args.offset ?? 0 })}`,
      ),
  },
  {
    name: 'list_customers',
    description: 'List customers with optional q (email/name) filter.',
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationProps,
        q: strProp('Free-text search (email, first_name, last_name)'),
        has_account: strProp("Filter by registered ('true') vs guest ('false')"),
      },
    },
    handler: async (args) =>
      adminRequest(
        `/admin/customers${qs({
          limit: args.limit ?? 20,
          offset: args.offset ?? 0,
          q: args.q,
          has_account: args.has_account,
          order: '-created_at',
        })}`,
      ),
  },
  {
    name: 'get_customer',
    description: 'Fetch a single customer by id.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: strProp('Customer id (cus_…)'), fields: strProp('Field expansion') },
    },
    handler: async (args) =>
      adminRequest(
        `/admin/customers/${encodeURIComponent(String(args.id))}${qs({ fields: args.fields })}`,
      ),
  },
  {
    name: 'list_regions',
    description: 'List configured regions (currency + tax + countries).',
    inputSchema: { type: 'object', properties: paginationProps },
    handler: async (args) =>
      adminRequest(`/admin/regions${qs({ limit: args.limit ?? 50, offset: args.offset ?? 0 })}`),
  },
  {
    name: 'list_sales_channels',
    description: 'List sales channels.',
    inputSchema: { type: 'object', properties: paginationProps },
    handler: async (args) =>
      adminRequest(
        `/admin/sales-channels${qs({ limit: args.limit ?? 50, offset: args.offset ?? 0 })}`,
      ),
  },
];

const toolsByName = new Map(tools.map((t) => [t.name, t]));

const server = new Server(
  { name: 'teherguminet-admin-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = toolsByName.get(req.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
    };
  }
  try {
    const result = await tool.handler((req.params.arguments ?? {}) as Record<string, unknown>);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: 'text', text: `Error: ${message}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
