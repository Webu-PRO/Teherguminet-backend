import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import { buildProductFeedXmlStep } from "./steps/build-product-feed-xml";
import { getProductFeedItemsStep } from "./steps/get-product-feed-items";

type GenerateProductFeedWorkflowInput = {
  currency_code: string;
  country_code: string;
};

const generateProductFeedWorkflow = createWorkflow(
  "generate-product-feed",
  function (input: GenerateProductFeedWorkflowInput) {
    const { items: feedItems } = getProductFeedItemsStep(input);

    const xml = buildProductFeedXmlStep({
      items: feedItems,
    });

    return new WorkflowResponse({
      xml,
    });
  }
);

export default generateProductFeedWorkflow;
