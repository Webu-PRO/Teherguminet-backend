import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type {
  CreateNotificationDTO,
  INotificationModuleService,
  IOrderModuleService,
  Logger,
  OrderDTO,
  Query,
} from "@medusajs/types";

import { dispatchNotificationsIndividually } from "../lib/dispatch-notifications";

type OrderUpdatedPayload = {
  id?: string;
  order_id?: string;
  order?: {
    id?: string;
  };
};

type CancelSnapshot = Record<string, number>;

const SNAPSHOT_KEY = "items_written_off_snapshot";
const TEMPLATE = "order-items-cancelled";

const resolveLogger = (container: SubscriberArgs["container"]) => {
  try {
    return container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  } catch {
    return undefined;
  }
};

const resolveOrderId = (payload: OrderUpdatedPayload) => {
  if (typeof payload.id === "string" && payload.id) {
    return payload.id;
  }

  if (typeof payload.order_id === "string" && payload.order_id) {
    return payload.order_id;
  }

  if (typeof payload.order?.id === "string" && payload.order.id) {
    return payload.order.id;
  }

  return null;
};

const normalizeNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const extractWrittenOffQuantity = (item: Record<string, unknown>) => {
  const direct =
    normalizeNumber(item.written_off_quantity) ??
    normalizeNumber(
      (item.detail as Record<string, unknown> | null)?.written_off_quantity,
    );

  if (typeof direct === "number") {
    return direct;
  }

  const raw = (item.detail as Record<string, unknown> | null)
    ?.raw_written_off_quantity as { value?: string | number } | undefined;

  return normalizeNumber(raw?.value);
};

const buildSnapshot = (items: Array<Record<string, unknown>>) => {
  const snapshot: CancelSnapshot = {};

  for (const item of items) {
    const id = item.id;
    if (typeof id !== "string" || !id) {
      continue;
    }

    const quantity = extractWrittenOffQuantity(item) ?? 0;
    snapshot[id] = quantity;
  }

  return snapshot;
};

const parseSnapshot = (metadata: Record<string, unknown>) => {
  const raw = metadata[SNAPSHOT_KEY];
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const snapshot: CancelSnapshot = {};
  for (const [key, value] of Object.entries(raw)) {
    const quantity = normalizeNumber(value);
    if (typeof quantity === "number") {
      snapshot[key] = quantity;
    }
  }

  return snapshot;
};

const snapshotsEqual = (a: CancelSnapshot, b: CancelSnapshot) => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }

  return true;
};

export default async function orderItemsCancelledHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderUpdatedPayload>) {
  const orderId = resolveOrderId(data);
  if (!orderId) {
    return;
  }

  const logger = resolveLogger(container);
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY);
  const orderModuleService = container.resolve<IOrderModuleService>(
    Modules.ORDER,
  );

  let notificationModuleService: INotificationModuleService | undefined;
  try {
    notificationModuleService = container.resolve<INotificationModuleService>(
      Modules.NOTIFICATION,
    );
  } catch {
    notificationModuleService = undefined;
  }

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "metadata",
      "shipping_address.*",
      "billing_address.*",
      "customer.*",
      "items.*",
      "items.detail.*",
    ],
    filters: {
      id: orderId,
    },
  });

  const order = orders?.[0] as unknown as OrderDTO | undefined;
  if (!order || !Array.isArray(order.items)) {
    return;
  }

  const items = order.items.map(
    (item) => item as unknown as Record<string, unknown>,
  );
  const metadata = (order.metadata as Record<string, unknown> | null) ?? {};

  const previousSnapshot = parseSnapshot(metadata);
  const currentSnapshot = buildSnapshot(items);

  if (!previousSnapshot) {
    const hasWrittenOff = Object.values(currentSnapshot).some(
      (value) => value > 0,
    );
    if (hasWrittenOff) {
      await orderModuleService.updateOrders(order.id, {
        metadata: {
          ...metadata,
          [SNAPSHOT_KEY]: currentSnapshot,
        },
      });
    }
    return;
  }

  if (snapshotsEqual(previousSnapshot, currentSnapshot)) {
    return;
  }

  const cancelledItems = items
    .map((item) => {
      const id = item.id;
      if (typeof id !== "string") {
        return null;
      }

      const current = currentSnapshot[id] ?? 0;
      const previous = previousSnapshot[id] ?? 0;
      if (current <= previous) {
        return null;
      }

      const delta = current - previous;
      const name =
        (typeof item.product_title === "string" && item.product_title.trim()) ||
        (typeof item.title === "string" && item.title.trim()) ||
        "Item";
      const sku =
        typeof item.sku === "string" && item.sku.trim()
          ? item.sku.trim()
          : undefined;
      const variantTitle =
        typeof item.variant_title === "string" && item.variant_title.trim()
          ? item.variant_title.trim()
          : undefined;

      return {
        id,
        name,
        quantity: delta,
        sku,
        variant_title: variantTitle,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        id: string;
        name: string;
        quantity: number;
        sku: string | undefined;
        variant_title: string | undefined;
      } => Boolean(entry),
    );

  await orderModuleService.updateOrders(order.id, {
    metadata: {
      ...metadata,
      [SNAPSHOT_KEY]: currentSnapshot,
    },
  });

  if (!cancelledItems.length) {
    return;
  }

  const email = order.email?.trim();
  if (!email || !notificationModuleService) {
    return;
  }

  const notification: CreateNotificationDTO = {
    to: email,
    channel: "email",
    template: TEMPLATE,
    data: {
      order,
      cancelled_items: cancelledItems,
    },
    trigger_type: "order.items_cancelled",
    resource_id: order.id,
    resource_type: "order",
  };

  await dispatchNotificationsIndividually(
    notificationModuleService,
    [notification],
    logger,
  );
}

export const config: SubscriberConfig = {
  event: "order.updated",
};
