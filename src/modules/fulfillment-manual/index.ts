import { ModuleProvider, Modules } from "@medusajs/framework/utils"

import ManualFulfillmentService from "./service"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [ManualFulfillmentService],
})
