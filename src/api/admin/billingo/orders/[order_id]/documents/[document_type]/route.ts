import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type {
  ICustomerModuleService,
  IOrderModuleService,
  OrderDTO,
  Query,
} from "@medusajs/types"

import {
  BILLINGO_METADATA_KEYS,
  BillingoRequestError,
  applyBillingoPartnerMetadata,
  createBillingoPartner,
  createBillingoInvoice,
  createBillingoReceipt,
  getBillingoConfig,
  getBillingoDocumentPdf,
  getBillingoPublicUrl,
  hasBillingoMetadata,
  isBillingoDebugEnabled,
  resolveBillingoPartnerId,
  type BillingoDocumentMetadata,
} from "../../../../../../../lib/billingo"

const resolveDocumentType = (value?: string | null) => {
  if (value === "invoice" || value === "receipt") {
    return value
  }

  return null
}

const readBillingoDocumentId = (
  metadata: Record<string, unknown> | null | undefined,
  type: "invoice" | "receipt"
) => {
  if (!metadata || typeof metadata !== "object") {
    return null
  }

  const key =
    type === "invoice" ? "billingo_invoice" : "billingo_receipt"
  const record = metadata[key]
  if (!record || typeof record !== "object") {
    return null
  }

  const id = (record as { id?: unknown }).id
  if (typeof id === "number" && Number.isFinite(id)) {
    return id
  }

  return null
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
      "total",
      "item_total",
      "tax_total",
      "item_tax_total",
      "shipping_total",
      "shipping_subtotal",
      "shipping_tax_total",
      "original_total",
      "original_item_total",
      "original_tax_total",
      "original_shipping_tax_total",
      "summary.*",
      "items.*",
      "items.tax_lines.*",
      "items.variant.id",
      "items.variant.title",
      "items.variant.sku",
      "items.variant.metadata",
      "items.variant.product.id",
      "items.variant.product.title",
      "items.variant.product.handle",
      "items.variant.product.metadata",
      "items.variant.product.tags.*",
      "shipping_methods.*",
      "shipping_methods.tax_lines.*",
      "billing_address.*",
      "shipping_address.*",
    ],
    filters: {
      id: orderId,
    },
  })

  return orders?.[0] as unknown as OrderDTO | undefined
}

const serializeUnknownError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return undefined
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return error
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { order_id: orderId, document_type: documentType } =
    req.params

  console.info("[Billingo] download request", {
    orderId,
    documentType,
  })

  if (!orderId) {
    console.warn("[Billingo] missing order id")
    res.status(400).json({ message: "Missing order id." })
    return
  }

  const resolvedType = resolveDocumentType(documentType)
  if (!resolvedType) {
    console.warn("[Billingo] invalid document type", { documentType })
    res.status(400).json({ message: "Invalid Billingo document type." })
    return
  }

  const config = getBillingoConfig()
  if (!config) {
    console.warn("[Billingo] config missing")
    res.status(400).json({ message: "Billingo is not configured." })
    return
  }

  try {
    const query = req.scope.resolve<Query>(
      ContainerRegistrationKeys.QUERY
    )
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "metadata"],
      filters: {
        id: orderId,
      },
    })

    const order = orders?.[0] as unknown as OrderDTO | undefined
    if (!order) {
      console.warn("[Billingo] order not found", { orderId })
      res.status(404).json({ message: "Order not found." })
      return
    }

    const metadata =
      (order.metadata as Record<string, unknown> | null) ?? null
    const metadataKeys = metadata ? Object.keys(metadata) : []
    const documentId = readBillingoDocumentId(
      metadata,
      resolvedType
    )

    if (!documentId) {
      console.warn("[Billingo] document id missing", {
        orderId,
        resolvedType,
        metadataKeys,
        hasInvoiceMeta: Boolean(metadata?.billingo_invoice),
        hasReceiptMeta: Boolean(metadata?.billingo_receipt),
      })
      res.status(404).json({
        message: "Billingo document not found for this order.",
      })
      return
    }

    const content = await getBillingoDocumentPdf(documentId, config)
    if (!content) {
      console.warn("[Billingo] document content missing", {
        orderId,
        resolvedType,
        documentId,
      })
      res.status(404).json({
        message: "Billingo document is not available yet.",
      })
      return
    }

    const prefix = "szamla"
    const filename = `${prefix}-${order.display_id ?? order.id}.pdf`
    const buffer = Buffer.from(content, "base64")

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    )
    res.status(200).send(buffer)
  } catch (error) {
    console.error("[Billingo] download failed", {
      orderId,
      documentType,
      error,
    })
    const message =
      error instanceof Error
        ? error.message
        : "Failed to download Billingo document."
    res.status(500).json({ message })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { order_id: orderId, document_type: documentType } =
    req.params

  console.info("[Billingo] create request", {
    orderId,
    documentType,
  })

  if (!orderId) {
    console.warn("[Billingo] missing order id")
    res.status(400).json({ message: "Missing order id." })
    return
  }

  const resolvedType = resolveDocumentType(documentType)
  if (!resolvedType) {
    console.warn("[Billingo] invalid document type", { documentType })
    res.status(400).json({ message: "Invalid Billingo document type." })
    return
  }

  const config = getBillingoConfig()
  if (!config) {
    console.warn("[Billingo] config missing")
    res.status(400).json({ message: "Billingo is not configured." })
    return
  }

  try {
    const order = await fetchOrderForBillingo(req, orderId)
    if (!order) {
      console.warn("[Billingo] order not found", { orderId })
      res.status(404).json({ message: "Order not found." })
      return
    }

    const metadata =
      (order.metadata as Record<string, unknown> | null) ?? {}
    if (hasBillingoMetadata(metadata, resolvedType)) {
      res.status(409).json({
        message: "Billingo document already exists for this order.",
        document: metadata[BILLINGO_METADATA_KEYS[resolvedType]],
      })
      return
    }

    let partnerId = resolveBillingoPartnerId(metadata)
    let customerMetadata: Record<string, unknown> | null = null
    let customerService: ICustomerModuleService | null = null
    if (!partnerId && order.customer_id) {
      try {
        customerService =
          req.scope.resolve<ICustomerModuleService>(Modules.CUSTOMER)
        const customer = await customerService.retrieveCustomer(
          order.customer_id,
          { select: ["id", "metadata"] }
        )
        customerMetadata =
          (customer.metadata as Record<string, unknown> | null) ?? {}
        partnerId = resolveBillingoPartnerId(customerMetadata)
      } catch (error) {
        console.warn("[Billingo] customer fetch failed", {
          orderId,
          documentType: resolvedType,
        })
      }
    }

    if (!partnerId) {
      const partner = await createBillingoPartner(order, config)
      partnerId = partner.id
    }

    const mergedMetadata = partnerId
      ? applyBillingoPartnerMetadata(metadata, partnerId)
      : metadata
    const orderForBillingo = partnerId
      ? { ...order, metadata: mergedMetadata }
      : order

    const document =
      resolvedType === "invoice"
        ? await createBillingoInvoice(orderForBillingo, config)
        : await createBillingoReceipt(orderForBillingo, config)

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
      } catch (error) {
        console.warn("[Billingo] public url fetch failed", {
          orderId,
          documentType: resolvedType,
          documentId: document?.id,
        })
      }
    }

    const orderModuleService =
      req.scope.resolve<IOrderModuleService>(Modules.ORDER)
    const payload: BillingoDocumentMetadata = {
      id: document.id,
      invoice_number: document.invoice_number,
      public_url: publicUrl,
      created_at: new Date().toISOString(),
    }

    if (partnerId && order.customer_id) {
      try {
        const service =
          customerService ??
          req.scope.resolve<ICustomerModuleService>(Modules.CUSTOMER)
        const metadataForCustomer = customerMetadata ?? {}
        await service.updateCustomers(order.customer_id, {
          metadata: {
            ...metadataForCustomer,
            billingo_partner_id: partnerId,
          },
        })
      } catch (error) {
        console.warn("[Billingo] customer metadata update failed", {
          orderId,
          documentType: resolvedType,
          partnerId,
        })
      }
    }

    await orderModuleService.updateOrders(order.id, {
      metadata: {
        ...mergedMetadata,
        [BILLINGO_METADATA_KEYS[resolvedType]]: payload,
      },
    })

    res.status(201).json({ document: payload })
  } catch (error) {
    const debugEnabled = isBillingoDebugEnabled()
    const billingoDetails =
      error instanceof BillingoRequestError
        ? {
            status: error.status,
            statusText: error.statusText,
            method: error.method,
            path: error.path,
            request: error.requestBody,
            response: error.responseData,
          }
        : undefined

    console.error("[Billingo] create failed", {
      orderId,
      documentType,
      error: serializeUnknownError(error),
      billingoDetails,
    })
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create Billingo document."
    const status =
      error instanceof BillingoRequestError ? error.status : 500
    res.status(status).json({
      message,
      ...(debugEnabled && billingoDetails
        ? { debug: billingoDetails }
        : {}),
    })
  }
}
