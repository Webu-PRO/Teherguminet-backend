import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

import {
  listFeedMarketsFromRegions,
  listSupportedFeedPairs,
} from "../../lib/feed-markets-loader";
import { isSupportedFeedPair } from "../../lib/feed-markets";
import generateLocalInventoryFeedWorkflow from "../../workflows/generate-local-inventory-feed";

const KNOWN_LOCAL_INVENTORY_FEED_CONFIG_ERRORS = [
  "Local inventory feed requires store codes.",
  "Product feed requires an absolute storefront URL.",
  "Invalid local inventory store code",
] as const;

export const LOCAL_INVENTORY_FEED_FALLBACK_ERROR_MESSAGE =
  "Failed to generate local inventory feed.";

export const readLocalInventoryFeedErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length) {
      return message;
    }
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message.trim();
    if (message.length) {
      return message;
    }
  }

  return null;
};

export const mapLocalInventoryFeedError = (error: unknown) => {
  const message = readLocalInventoryFeedErrorMessage(error);

  if (
    message &&
    KNOWN_LOCAL_INVENTORY_FEED_CONFIG_ERRORS.some((prefix) =>
      message.startsWith(prefix)
    )
  ) {
    return {
      status: 400 as const,
      message,
    };
  }

  return {
    status: 500 as const,
    message: LOCAL_INVENTORY_FEED_FALLBACK_ERROR_MESSAGE,
  };
};

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

  let result: { xml: string };
  try {
    const workflowRun = await generateLocalInventoryFeedWorkflow(req.scope).run({
      input: {
        currency_code,
        country_code,
      },
    });
    result = workflowRun.result as { xml: string };
  } catch (error) {
    const mappedError = mapLocalInventoryFeedError(error);
    res.status(mappedError.status).json({
      message: mappedError.message,
    });
    return;
  }

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'inline; filename="local-inventory-feed.xml"'
  );
  res.status(200).send(result.xml);
}
