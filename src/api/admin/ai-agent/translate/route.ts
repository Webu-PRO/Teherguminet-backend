import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import type { AdminTranslateHuToSkType } from "../middlewares"
import { translateHuToSk } from "../../../../lib/ai-agent"

const normalizeFailureMessage = (value: string) =>
  value
    .replace(/^CODEX_AUTH_REQUIRED:\s*/i, "")
    .replace(/^CODEX_SIDECAR_UNAVAILABLE:\s*/i, "")
    .replace(/^CODEX_EXEC_FAILED:\s*/i, "")
    .trim()

const resolveStatusCode = (message: string) => {
  if (/^CODEX_AUTH_REQUIRED:/i.test(message)) {
    return 400
  }

  if (/^CODEX_SIDECAR_UNAVAILABLE:/i.test(message)) {
    return 503
  }

  if (/^CODEX_EXEC_FAILED:/i.test(message)) {
    return 502
  }

  return 500
}

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
    const rawMessage =
      error instanceof Error && error.message.trim().length
        ? error.message
        : "Nem sikerült fordítani a HU mezőket SK nyelvre."

    const statusCode = resolveStatusCode(rawMessage)
    const message = normalizeFailureMessage(rawMessage)

    res.status(statusCode).json({
      message: message || "Nem sikerült fordítani a HU mezőket SK nyelvre.",
    })
  }
}
