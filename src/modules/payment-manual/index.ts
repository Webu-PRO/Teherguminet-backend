import { ModuleProvider, Modules } from "@medusajs/framework/utils"

import ManualPaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [ManualPaymentProviderService],
})
