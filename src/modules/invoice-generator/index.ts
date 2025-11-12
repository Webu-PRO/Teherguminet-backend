import InvoiceModuleService from "./service";
import { Module } from "@medusajs/framework/utils";

export const INVOICE_MODULE = "invoiceGenerator";

export default Module(INVOICE_MODULE, {
  service: InvoiceModuleService,
});
