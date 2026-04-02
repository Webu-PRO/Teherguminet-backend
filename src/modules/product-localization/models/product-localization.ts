import { model } from "@medusajs/framework/utils"

export const ProductLocalization = model
  .define("product_localization", {
    id: model.id({ prefix: "ploc" }).primaryKey(),
    product_id: model.text().searchable(),
    title_hu: model.text().nullable(),
    title_sk: model.text().nullable(),
    description_hu: model.text().nullable(),
    description_sk: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_product_localization_product_id_unique",
      on: ["product_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default ProductLocalization

