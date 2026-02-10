import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type {
  CreateNotificationDTO,
  IOrderModuleService,
  Logger,
  OrderDTO,
  Query,
} from "@medusajs/types"

import {
  BILLINGO_METADATA_KEYS,
  createBillingoInvoice,
  createBillingoReceipt,
  getBillingoConfig,
  getBillingoDocumentPdf,
  getBillingoPublicUrl,
  hasBillingoMetadata,
  type BillingoDocumentMetadata,
} from "../../../../../../../../lib/billingo"
import { dispatchNotificationsIndividually } from "../../../../../../../../lib/dispatch-notifications"

const resolveDocumentType = (value?: string | null) => {
  if (value === "invoice" || value === "receipt") {
    return value
  }

  return null
}

const resolveLogger = (req: MedusaRequest) => {
  try {
    return req.scope.resolve<Logger>("logger")
  } catch {
    return undefined
  }
}

const fetchOrderForBillingo = async (
  req: MedusaRequest,
  orderId: string
) => {
  const query = req.scope.resolve<Query>(
    ContainerRegistrationKeys.QUERY
  )
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "created_at",
      "currency_code",
      "metadata",
      "shipping_total",
      "items.*",
      "items.tax_lines.*",
      "shipping_methods.*",
      "shipping_methods.tax_lines.*",
      "billing_address.*",
      "shipping_address.*",
      "customer.*",
      "subtotal",
      "discount_total",
      "tax_total",
      "total",
    ],
    filters: {
      id: orderId,
    },
  })

  return orders?.[0] as OrderDTO | undefined
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const fetchPdfWithRetry = async (
  documentId: number,
  config: ReturnType<typeof getBillingoConfig>
) => {
  if (!config) {
    return null
  }

  const maxAttempts = 5
  let delayMs = 1200

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const content = await getBillingoDocumentPdf(documentId, config)
      if (content) {
        return content
      }
    } catch {
      // retry
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs)
      delayMs += 1200
    }
  }

  return null
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { order_id: orderId, document_type: documentType } =
    req.params

  console.info("[Billingo] email request", {
    orderId,
    documentType,
  })

  if (!orderId) {
    res.status(400).json({ message: "Missing order id." })
    return
  }

  const resolvedType = resolveDocumentType(documentType)
  if (!resolvedType) {
    res.status(400).json({ message: "Invalid Billingo document type." })
    return
  }

  const config = getBillingoConfig()
  if (!config) {
    res.status(400).json({ message: "Billingo is not configured." })
    return
  }

  try {
    const order = await fetchOrderForBillingo(req, orderId)
    if (!order) {
      res.status(404).json({ message: "Order not found." })
      return
    }

    const email = order.email?.trim()
    if (!email) {
      res.status(400).json({
        message: "Order is missing an email address.",
      })
      return
    }

    const orderModuleService =
      req.scope.resolve<IOrderModuleService>(Modules.ORDER)
    const metadata =
      (order.metadata as Record<string, unknown> | null) ?? {}

    let documentMeta: BillingoDocumentMetadata | null = null
    const key = BILLINGO_METADATA_KEYS[resolvedType]

    if (hasBillingoMetadata(metadata, resolvedType)) {
      documentMeta = metadata[key] as BillingoDocumentMetadata
    } else {
      if (resolvedType === "invoice" && !config.invoiceBlockId) {
        res.status(400).json({
          message: "Billingo invoice block id is missing.",
        })
        return
      }

      const document =
        resolvedType === "invoice"
          ? await createBillingoInvoice(order, config)
          : await createBillingoReceipt(order, config)

      let publicUrl: string | undefined
      if (typeof document?.id === "number") {
        try {
          const publicData = await getBillingoPublicUrl(
            document.id,
            config
          )
          publicUrl =
            typeof publicData?.public_url === "string"
              ? publicData.public_url
              : undefined
        } catch {
          // ignore public url failure
        }
      }

      documentMeta = {
        id: document.id,
        invoice_number: document.invoice_number,
        public_url: publicUrl,
        created_at: new Date().toISOString(),
      }

      await orderModuleService.updateOrders(order.id, {
        metadata: {
          ...metadata,
          [key]: documentMeta,
        },
      })
    }

    if (!documentMeta?.id) {
      res.status(404).json({
        message: "Billingo invoice id is missing for this order.",
      })
      return
    }

    const content = await fetchPdfWithRetry(documentMeta.id, config)
    if (!content) {
      res.status(404).json({
        message: "Billingo document is not available yet.",
      })
      return
    }

    const ref = order.display_id ?? order.id ?? "order"
    const safeRef = String(ref).replace(/[^a-zA-Z0-9_-]+/g, "-")
    const filename = `szamla-${safeRef}.pdf`

    const notificationModuleService =
      req.scope.resolve(Modules.NOTIFICATION)
    const logger = resolveLogger(req)

    const paymentProvider =
      typeof metadata.payment_provider === "string"
        ? metadata.payment_provider
        : typeof metadata.payment_provider_id === "string"
          ? metadata.payment_provider_id
          : typeof metadata.payment_method_id === "string"
            ? metadata.payment_method_id
            : undefined

    const notification: CreateNotificationDTO = {
      to: email,
      channel: "email",
      template:
        resolvedType === "invoice" ? "order-placed" : "payment-receipt",
      data:
        resolvedType === "invoice"
          ? { order }
          : {
              order,
              payment: {
                amount: order.total ?? undefined,
                currency_code: order.currency_code ?? undefined,
                provider_id: paymentProvider,
                captured_at: order.created_at ?? undefined,
              },
            },
      attachments: [
        {
          filename,
          content,
          content_type: "application/pdf",
        },
      ],
      trigger_type:
        resolvedType === "invoice"
          ? "billingo.invoice_email"
          : "billingo.receipt_email",
      resource_id: order.id,
      resource_type: "order",
    }

    await dispatchNotificationsIndividually(
      notificationModuleService,
      [notification],
      logger
    )

    res.status(200).json({ status: "sent" })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to send Billingo email."
    console.error("[Billingo] email failed", {
      orderId,
      documentType,
      error,
    })
    res.status(500).json({ message })
  }
}
