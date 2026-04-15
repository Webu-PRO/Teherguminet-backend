import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import { buildLocalInventoryFeedXmlStep } from "./steps/build-local-inventory-feed-xml";
import { getProductFeedItemsStep } from "./steps/get-product-feed-items";

type GenerateLocalInventoryFeedWorkflowInput = {
  currency_code: string;
  country_code: string;
};

const generateLocalInventoryFeedWorkflow = createWorkflow(
  "generate-local-inventory-feed",
  function (input: GenerateLocalInventoryFeedWorkflowInput) {
    const { items: feedItems } = getProductFeedItemsStep(input);

    const xml = buildLocalInventoryFeedXmlStep({
      items: feedItems,
      country_code: input.country_code,
    });

    return new WorkflowResponse({
      xml,
    });
  }
);

export default generateLocalInventoryFeedWorkflow;

