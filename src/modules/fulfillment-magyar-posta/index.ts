import { ModuleProvider, Modules } from "@medusajs/framework/utils";

import MagyarPostaFulfillmentService from "./service";

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [MagyarPostaFulfillmentService],
});
