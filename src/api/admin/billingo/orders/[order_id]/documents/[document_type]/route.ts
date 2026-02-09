import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { OrderDTO, Query } from "@medusajs/types"

import {
  getBillingoConfig,
  getBillingoDocumentPdf,
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

    const order = orders?.[0] as OrderDTO | undefined
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

    const prefix = resolvedType === "invoice" ? "szamla" : "nyugta"
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
