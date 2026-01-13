import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"

import { sendNotificationStep } from "./steps/send-notification"

type WorkflowInput = {
  id: string
}

export const sendOrderConfirmationWorkflow = createWorkflow(
  "send-order-confirmation",
  ({ id }: WorkflowInput) => {
    const { data: orders } = useQueryGraphStep({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "metadata",
        "currency_code",
        "total",
        "items.*",
        "shipping_address.*",
        "billing_address.*",
        "shipping_methods.*",
        "customer.*",
        "subtotal",
        "discount_total",
        "shipping_total",
        "tax_total",
        "item_subtotal",
        "item_total",
        "item_tax_total",
      ],
      filters: {
        id,
      },
      options: {
        throwIfKeyNotFound: true,
      },
    })

    const notification = when({ orders }, (data) => !!data.orders[0]?.email).then(
      () => {
        const order = orders[0]
        const confirmationKey = transform({ order }, ({ order }) =>
          order?.id ? `order-placed-${order.id}` : undefined
        )
        const thanksKey = transform({ order }, ({ order }) =>
          order?.id ? `order-thanks-${order.id}` : undefined
        )

        return sendNotificationStep([
          {
            to: order.email!,
            channel: "email",
            template: "order-placed",
            data: {
              order,
            },
            resource_id: order.id,
            resource_type: "order",
            trigger_type: "order.placed",
            idempotency_key: confirmationKey,
          },
          {
            to: order.email!,
            channel: "email",
            template: "order-thanks",
            data: {
              order,
            },
            resource_id: order.id,
            resource_type: "order",
            trigger_type: "order.placed",
            idempotency_key: thanksKey,
          },
        ])
      }
    )

    return new WorkflowResponse({
      notification,
    })
  }
)
