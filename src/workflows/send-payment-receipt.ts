import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"

import { sendNotificationStep } from "./steps/send-notification"

type WorkflowInput = {
  paymentId: string
}

export const sendPaymentReceiptWorkflow = createWorkflow(
  "send-payment-receipt",
  ({ paymentId }: WorkflowInput) => {
    const { data: payments } = useQueryGraphStep({
      entity: "payment",
      fields: [
        "id",
        "amount",
        "currency_code",
        "provider_id",
        "captured_at",
        "payment_collection.id",
        "payment_collection.currency_code",
        "payment_collection.order.id",
        "payment_collection.order.display_id",
        "payment_collection.order.email",
        "payment_collection.order.metadata",
        "payment_collection.order.currency_code",
        "payment_collection.order.total",
        "payment_collection.order.subtotal",
        "payment_collection.order.shipping_total",
        "payment_collection.order.item_total",
        "payment_collection.order.items.*",
        "payment_collection.order.shipping_address.*",
        "payment_collection.order.billing_address.*",
        "payment_collection.order.customer.*",
      ],
      filters: {
        id: paymentId,
      },
      options: {
        throwIfKeyNotFound: true,
      },
    })

    const payload = transform({ payments }, ({ payments }) => {
      const payment = payments?.[0]
      return {
        payment,
        order: payment?.payment_collection?.order,
      }
    })

    const notification = when(
      { payload },
      ({ payload }) => Boolean(payload.order?.email)
    ).then(() => {
      const { payment, order } = payload

      if (!order?.email) {
        return null
      }

      const idempotencyKey = transform({ payment }, ({ payment }) =>
        payment?.id ? `payment-receipt-${payment.id}` : undefined
      )

      return sendNotificationStep([
        {
          to: order.email,
          channel: "email",
          template: "payment-receipt",
          data: {
            order,
            payment,
          },
          resource_id: order.id,
          resource_type: "order",
          trigger_type: "payment.captured",
          idempotency_key: idempotencyKey,
        },
      ])
    })

    return new WorkflowResponse({
      notification,
    })
  }
)
