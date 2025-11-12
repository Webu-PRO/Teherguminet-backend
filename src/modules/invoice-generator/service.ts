import { MedusaService } from "@medusajs/framework/utils";
import { InvoiceConfig } from "./models/invoice-config";
import { Invoice } from "./models/invoice";

class InvoiceGeneratorService extends MedusaService({
  InvoiceConfig,
  Invoice,
}) {}

export default InvoiceGeneratorService;
