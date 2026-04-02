import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import type { AdminTranslateHuToSkType } from "../middlewares"
import { translateHuToSk } from "../../../../lib/ai-agent"

export async function POST(
  req: MedusaRequest<AdminTranslateHuToSkType>,
  res: MedusaResponse
) {
  try {
    const result = await translateHuToSk(req.validatedBody)

    res.status(200).json({
      ok: true,
      ...result,
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length
        ? error.message
        : "Nem sikerült fordítani a HU mezőket SK nyelvre."

    const statusCode = message.includes("OPENAI_API_KEY") ? 400 : 500

    res.status(statusCode).json({
      message,
    })
  }
}
