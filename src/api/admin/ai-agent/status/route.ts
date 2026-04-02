import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { getAiAgentStatus } from "../../../../lib/ai-agent"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = getAiAgentStatus()

  res.status(200).json({
    ok: true,
    status,
  })
}
