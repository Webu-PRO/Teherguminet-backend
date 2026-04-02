import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { getAiAgentStatus } from "../../../../lib/ai-agent"

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const status = await getAiAgentStatus()

  res.status(200).json({
    ok: true,
    status,
  })
}
