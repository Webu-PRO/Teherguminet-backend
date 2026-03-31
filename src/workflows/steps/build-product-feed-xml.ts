import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

import { FeedItem } from "./get-product-feed-items";

type StepInput = {
  items: FeedItem[];
};

const escapeXml = (str: string) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const buildProductFeedXmlStep = createStep(
  "build-product-feed-xml",
  async (input: StepInput) => {
    const itemsXml = input.items
      .map((item) => {
        return (
          "<item>" +
          `<g:id>${escapeXml(item.id)}</g:id>` +
          `<title>${escapeXml(item.title)}</title>` +
          `<description>${escapeXml(item.description)}</description>` +
          `<link>${escapeXml(item.link)}</link>` +
          (item.image_link
            ? `<g:image_link>${escapeXml(item.image_link)}</g:image_link>`
            : "") +
          (item.additional_image_link
            ? `<g:additional_image_link>${escapeXml(item.additional_image_link)}</g:additional_image_link>`
            : "") +
          `<g:availability>${escapeXml(item.availability)}</g:availability>` +
          `<g:price>${escapeXml(item.price)}</g:price>` +
          (item.sale_price
            ? `<g:sale_price>${escapeXml(item.sale_price)}</g:sale_price>`
            : "") +
          `<g:condition>${escapeXml(item.condition || "new")}</g:condition>` +
          (item.brand ? `<g:brand>${escapeXml(item.brand)}</g:brand>` : "") +
          `<g:item_group_id>${escapeXml(item.item_group_id)}</g:item_group_id>` +
          "</item>"
        );
      })
      .join("");

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">' +
      "<channel>" +
      "<title>Product Feed</title>" +
      "<description>Product Feed for Social Platforms</description>" +
      itemsXml +
      "</channel>" +
      "</rss>";

    return new StepResponse(xml);
  }
);
