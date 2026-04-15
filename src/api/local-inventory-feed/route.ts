import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

import {
  listFeedMarketsFromRegions,
  listSupportedFeedPairs,
} from "../../lib/feed-markets-loader";
import { isSupportedFeedPair } from "../../lib/feed-markets";
import generateLocalInventoryFeedWorkflow from "../../workflows/generate-local-inventory-feed";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { currency_code, country_code } = req.validatedQuery as {
    currency_code: string;
    country_code: string;
  };

  const markets = await listFeedMarketsFromRegions(req.scope);
  const isSupportedMarket = isSupportedFeedPair(markets, {
    currency_code,
    country_code,
  });

  if (!isSupportedMarket) {
    const supportedPairs = listSupportedFeedPairs(markets);
    const supportedPairsText = supportedPairs.length
      ? supportedPairs.join(", ")
      : "none";
    res.status(400).json({
      message: `Unsupported local inventory feed market. Supported pairs: ${supportedPairsText}.`,
    });
    return;
  }

  const { result } = await generateLocalInventoryFeedWorkflow(req.scope).run({
    input: {
      currency_code,
      country_code,
    },
  });

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'inline; filename="local-inventory-feed.xml"'
  );
  res.status(200).send(result.xml);
}

