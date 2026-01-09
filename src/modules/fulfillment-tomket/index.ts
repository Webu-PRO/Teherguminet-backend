import { ModuleProvider, Modules } from "@medusajs/framework/utils"

import TomketFulfillmentService from "./service"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [TomketFulfillmentService],
})
