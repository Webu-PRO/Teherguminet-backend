import {
  createStep,
  createWorkflow,
  transform,
  when,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"

import {
  getBillingoConfig,
  getBillingoDocumentPdf,
} from "../lib/billingo"
import { sendNotificationStep } from "./steps/send-notification"

type WorkflowInput = {
  paymentId: string
}

type ReceiptAttachment = {
  filename: string
  content: string
  content_type?: string
}

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

const fetchBillingoReceiptAttachmentStep = createStep(
  "fetch-billingo-receipt-attachment",
  async (
    input: {
      order?: {
        id?: string
        display_id?: number | string | null
        metadata?: Record<string, unknown> | null
      } | null
    }
  ) => {
    const config = getBillingoConfig()
    if (!config) {
      return new StepResponse(null)
    }

    const receiptMeta = input.order?.metadata?.billingo_receipt as
      | { id?: number | null }
      | null
    const receiptId =
      typeof receiptMeta?.id === "number" ? receiptMeta.id : null
    if (!receiptId) {
      return new StepResponse(null)
    }

    const ref = input.order?.display_id ?? input.order?.id ?? "order"
    const safeRef = String(ref).replace(/[^a-zA-Z0-9_-]+/g, "-")
    const filename = `szamla-${safeRef}.pdf`

    const maxAttempts = 5
    let delayMs = 1200

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const content = await getBillingoDocumentPdf(receiptId, config)
        if (content) {
          const attachment: ReceiptAttachment = {
            filename,
            content,
            content_type: "application/pdf",
          }
          return new StepResponse(attachment)
        }
      } catch {
        // retry
      }

      if (attempt < maxAttempts) {
        await sleep(delayMs)
        delayMs += 1200
      }
    }

    return new StepResponse(null)
  }
)

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
      const order = payment?.payment_collection?.order

      return { payment, order }
    })

    const receiptAttachment = fetchBillingoReceiptAttachmentStep({
      order: payload.order,
    })
    const attachments = transform(
      { receiptAttachment },
      ({ receiptAttachment }) =>
        receiptAttachment ? [receiptAttachment] : undefined
    )

    const notification = when({ payload }, ({ payload }) =>
      Boolean(payload?.order?.email)
    ).then(() => {
      const { payment, order } = payload ?? {}
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
          attachments,
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
