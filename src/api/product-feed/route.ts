import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

import generateProductFeedWorkflow from "../../workflows/generate-product-feed";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { currency_code, country_code } = req.validatedQuery as {
    currency_code: string;
    country_code: string;
  };

  const { result } = await generateProductFeedWorkflow(req.scope).run({
    input: {
      currency_code,
      country_code,
    },
  });

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="product-feed.xml"');
  res.status(200).send(result.xml);
}
