import { Module } from "@medusajs/framework/utils"

import ProductLocalizationModuleService from "./service"

export const PRODUCT_LOCALIZATION_MODULE = "productLocalization"

export default Module(PRODUCT_LOCALIZATION_MODULE, {
  service: ProductLocalizationModuleService,
})

