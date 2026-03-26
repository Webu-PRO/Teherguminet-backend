# Email Actions Matrix

This file lists **when emails are sent**, **to whom**, and **which template/email ID is used**.

## Template ID Resolution (Resend)

For each notification template key (`template`), the Resend provider resolves template IDs in this order:

1. `template_ids["<template>.<language>"]`
2. `template_ids["<template>"]`
3. Fallback to local React/HTML template renderer

Language-aware keys are usually `hu` or `sk`.

## Trigger Matrix

### Order + Payment

| Action / Event | Sends | Templates | To | Trigger Type | Idempotency Key | Source |
|---|---:|---|---|---|---|---|
| `order.placed` | 2 | `order-thanks`, `order-placed` | `order.email` | `order.placed` | `order-thanks-{orderId}`, `order-placed-{orderId}` | `src/subscribers/order-placed.ts`, `src/workflows/send-order-confirmation.ts` |
| `payment.captured` | 1 | `payment-receipt` | `order.email` | `payment.captured` | `payment-receipt-{paymentId}` | `src/subscribers/payment-captured.ts`, `src/workflows/send-payment-receipt.ts` |
| `payment.captured` (own delivery only) | 1 | `own-delivery-payment-notice` | `order.email` | `payment.captured.own_delivery` | `own-delivery-payment-notice-{paymentId}` | `src/subscribers/payment-captured.ts` |
| `order.updated` (written-off qty increased) | 1 | `order-items-cancelled` | `order.email` | `order.items_cancelled` | _(none)_ | `src/subscribers/order-items-cancelled.ts` |

### Fulfillment + Shipping

| Action / Event | Sends | Templates | To | Trigger Type | Idempotency Key | Source |
|---|---:|---|---|---|---|---|
| `order.fulfillment_created` / `fulfillment.created` (own delivery) | 2 | `own-delivery-fulfillment-created`, `own-delivery-shipped` | `order.email` | `event.name` | `{template}-{fulfillmentId}` | `src/subscribers/own-delivery-fulfillment-created.ts` |
| `FulfillmentWorkflowEvents.SHIPMENT_CREATED` (own delivery) | 1 | `own-delivery-shipped` | `order.email` | `event.name` | `own-delivery-shipped-{fulfillmentId}` | `src/subscribers/own-delivery-shipment-created.ts` |
| `FulfillmentEvents.FULFILLMENT_UPDATED` + `delivered_at` present | 1 | `order-delivered` OR `order-pickup-ready` OR `own-delivery-delivered` | `order.email` | `event.name` | `{selectedTemplate}-{fulfillmentId}` | `src/subscribers/fulfillment-delivered.ts` |
| `order.fulfillment_created` / `fulfillment.created` (GLS shipment success path) | 1 | `gls-shipment-created` | `order.email` | `gls.shipment_created` | _(none)_ | `src/subscribers/fulfillment-created.ts` |
| Admin API: GLS label cancel endpoint | 1 | `gls-label-cancelled` | `fulfillment.order.email` | `gls.label_cancelled` | _(none)_ | `src/api/admin/gls/fulfillments/[fulfillment_id]/route.ts` |

### User / Auth

| Action / Event | Sends | Templates | To | Trigger Type | Idempotency Key | Source |
|---|---:|---|---|---|---|---|
| `invite.created`, `invite.resent` | 1 | `user-invited` | `invite.email` | `event.name` | _(none)_ | `src/subscribers/invite-created.ts` |
| `auth.password_reset` | 1 | `password-reset` | `payload.email` OR `payload.identifier` OR `entity_id` | `auth.password_reset` | _(none)_ | `src/subscribers/password-reset.ts` |

### Automation / Job

| Action / Event | Sends | Templates | To | Trigger Type | Idempotency Key | Source |
|---|---:|---|---|---|---|---|
| Scheduled job `abandoned-cart-notification` (daily) | 1 per cart | `abandoned-cart` | `cart.email` | _(not explicitly set)_ | _(none)_ | `src/jobs/send-abandoned-cart-notification.ts`, `src/workflows/send-abandoned-carts.ts`, `src/workflows/steps/send-abandoned-notifications.ts` |
| `product.created` (demo/dev) | 1 | `product-created` | `test@gmail.com` | `product.created` | _(none)_ | `src/subscribers/product-created.ts`, `src/workflows/send-email.ts` |

## Quick Reading Notes

- `Sends` = number of notifications created for that single trigger execution.
- `event.name` means the subscriber forwards the incoming event name directly.
- `Templates` is the Medusa notification template key; Resend template ID mapping is applied later.

## `RESEND_TEMPLATE_ID_*` Environment Variable Mapping

These env vars are mapped in `medusa-config.ts` to `template_ids` keys:

- `RESEND_TEMPLATE_ID_ORDER_PLACED` -> `order-placed`
- `RESEND_TEMPLATE_ID_ORDER_THANKS` -> `order-thanks`
- `RESEND_TEMPLATE_ID_ORDER_DELIVERED` -> `order-delivered`
- `RESEND_TEMPLATE_ID_ORDER_PICKUP_READY` -> `order-pickup-ready`
- `RESEND_TEMPLATE_ID_OWN_DELIVERY_PAYMENT_NOTICE` -> `own-delivery-payment-notice`
- `RESEND_TEMPLATE_ID_OWN_DELIVERY_SHIPPED` -> `own-delivery-shipped`
- `RESEND_TEMPLATE_ID_OWN_DELIVERY_DELIVERED` -> `own-delivery-delivered`
- `RESEND_TEMPLATE_ID_PAYMENT_RECEIPT` -> `payment-receipt`
- `RESEND_TEMPLATE_ID_USER_INVITED` -> `user-invited`
- `RESEND_TEMPLATE_ID_ABANDONED_CART` -> `abandoned-cart`
- `RESEND_TEMPLATE_ID_PASSWORD_RESET` -> `password-reset`
- `RESEND_TEMPLATE_ID_GLS_LABEL_CANCELLED` -> `gls-label-cancelled`
- `RESEND_TEMPLATE_ID_ORDER_ITEMS_CANCELLED` -> `order-items-cancelled`
- `RESEND_TEMPLATE_ID_GLS_SHIPMENT_CREATED` -> `gls-shipment-created`

Notes:

- `own-delivery-fulfillment-created` has no dedicated `RESEND_TEMPLATE_ID_*` env var, but it can still be set via:
  - `RESEND_TEMPLATE_IDS_JSON` (JSON map), or
  - `.resend-template-ids.json` / `RESEND_TEMPLATE_IDS_FILE`
- Per-language template IDs are also supported with keys like `"order-placed.hu"` and `"order-placed.sk"`.
