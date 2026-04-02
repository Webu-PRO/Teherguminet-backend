import { MedusaService } from "@medusajs/framework/utils"

import { ProductLocalization } from "./models"

class ProductLocalizationModuleService extends MedusaService({
  ProductLocalization,
}) {}

export default ProductLocalizationModuleService

