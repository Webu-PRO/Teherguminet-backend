import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { startAiAgentAuth } from "../../../../../lib/ai-agent"

export async function POST(_req: MedusaRequest, res: MedusaResponse) {
  const status = await startAiAgentAuth()

  res.status(200).json({
    ok: true,
    status,
  })
}
