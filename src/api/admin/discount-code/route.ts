import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  type AdminGenerateDiscountCodeType,
} from "./middlewares"
import { DiscountGeneratorService } from "../../../lib/discount-generator"

export async function POST(
  req: MedusaRequest<AdminGenerateDiscountCodeType>,
  res: MedusaResponse
) {
  const discountGeneratorService = new DiscountGeneratorService(req.scope)
  const promotion = await discountGeneratorService.generateDiscount(
    req.validatedBody.discount_code
  )

  res.status(200).json({
    promotion,
  })
}
