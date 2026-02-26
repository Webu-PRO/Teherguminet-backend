import {
  createStep,
  createWorkflow,
  transform,
  when,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"

import { getBillingoConfig, getBillingoDocumentPdf } from "../lib/billingo"
import { sendNotificationStep } from "./steps/send-notification"

type WorkflowInput = {
  id: string
}

type InvoiceAttachment = {
  filename: string
  content: string
  content_type?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const fetchBillingoInvoiceAttachmentStep = createStep(
  "fetch-billingo-invoice-attachment",
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

    const invoiceMeta = input.order?.metadata?.billingo_invoice as
      | { id?: number | null }
      | null
    const invoiceId =
      typeof invoiceMeta?.id === "number" ? invoiceMeta.id : null
    if (!invoiceId) {
      return new StepResponse(null)
    }

    const ref = input.order?.display_id ?? input.order?.id ?? "order"
    const safeRef = String(ref).replace(/[^a-zA-Z0-9_-]+/g, "-")
    const filename = `szamla-${safeRef}.pdf`

    const maxAttempts = 5
    let delayMs = 1200

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const content = await getBillingoDocumentPdf(invoiceId, config)
        if (content) {
          const attachment: InvoiceAttachment = {
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

    const payload = transform({ orders }, ({ orders }) => ({
      order: orders?.[0],
    }))

    const invoiceAttachment = fetchBillingoInvoiceAttachmentStep({
      order: payload.order,
    })
    const attachments = transform(
      { invoiceAttachment },
      ({ invoiceAttachment }) =>
        invoiceAttachment ? [invoiceAttachment] : undefined
    )

    const notification = when(
      { payload },
      ({ payload }) => !!payload.order?.email
    ).then(() => {
      const { order } = payload
      if (!order?.email) {
        return null
      }

      const confirmationKey = transform(
        { order },
        ({ order }: { order?: { id?: string | null } | null }) =>
          order?.id ? `order-placed-${order.id}` : undefined
      )
      const thanksKey = transform(
        { order },
        ({ order }: { order?: { id?: string | null } | null }) =>
          order?.id ? `order-thanks-${order.id}` : undefined
      )

      return sendNotificationStep([
        {
          to: order.email,
          channel: "email",
          template: "order-thanks",
          data: {
            order,
          },
          attachments,
          resource_id: order.id,
          resource_type: "order",
          trigger_type: "order.placed",
          idempotency_key: thanksKey,
        },
        {
          to: order.email,
          channel: "email",
          template: "order-placed",
          data: {
            order,
          },
          attachments,
          resource_id: order.id,
          resource_type: "order",
          trigger_type: "order.placed",
          idempotency_key: confirmationKey,
        },
      ])
    })

    return new WorkflowResponse({
      notification,
    })
  }
)
