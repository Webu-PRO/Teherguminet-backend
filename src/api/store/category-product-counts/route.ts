import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Published-product count per category, in a single GROUP BY over the
 * product<->category pivot table.
 *
 * The storefront only needs the numbers for the category sidebar badges.
 * Asking `/store/product-categories?fields=*products` for the same
 * information returns every product object (~20 MB, ~5 s) on each render.
 */

export type CategoryProductCountRow = {
  product_category_id: string;
  count: string | number;
};

export const toCategoryProductCounts = (
  rows: CategoryProductCountRow[]
): Record<string, number> => {
  const counts: Record<string, number> = {};

  for (const row of rows) {
    const count = Number(row.count);
    if (row.product_category_id && Number.isFinite(count)) {
      counts[row.product_category_id] = count;
    }
  }

  return counts;
};

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION);

  const rows = (await knex("product_category_product as pcp")
    .join("product as p", "p.id", "pcp.product_id")
    .whereNull("p.deleted_at")
    .where("p.status", "published")
    .groupBy("pcp.product_category_id")
    .select("pcp.product_category_id")
    .count("* as count")) as CategoryProductCountRow[];

  res.setHeader(
    "Cache-Control",
    "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
  );
  res.status(200).json({ counts: toCategoryProductCounts(rows) });
}
