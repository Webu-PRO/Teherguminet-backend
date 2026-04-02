import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { getAiAgentAuthStatus } from "../../../../../lib/ai-agent"

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const status = await getAiAgentAuthStatus()

  res.status(200).json({
    ok: true,
    status,
  })
}
