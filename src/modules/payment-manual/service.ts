import { randomUUID } from "crypto"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  CreateAccountHolderInput,
  CreateAccountHolderOutput,
  DeleteAccountHolderInput,
  DeleteAccountHolderOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/types"

type InjectedDependencies = Record<string, unknown> & {
  logger?: Logger
}

class ManualPaymentProviderService extends AbstractPaymentProvider {
  static identifier = "manual"

  constructor(
    container: InjectedDependencies,
    options: Record<string, unknown>
  ) {
    super(container, options)
  }

  async getStatus(_: unknown): Promise<string> {
    return "authorized"
  }

  async getPaymentData(_: unknown): Promise<Record<string, unknown>> {
    return {}
  }

  async initiatePayment(
    _: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    return { data: {}, id: randomUUID() }
  }

  async getPaymentStatus(
    _: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    return { status: PaymentSessionStatus.AUTHORIZED }
  }

  async retrievePayment(
    _: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return {}
  }

  async authorizePayment(
    _: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    return { data: {}, status: PaymentSessionStatus.AUTHORIZED }
  }

  async updatePayment(_: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: {} }
  }

  async deletePayment(_: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: {} }
  }

  async capturePayment(_: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: {} }
  }

  async createAccountHolder(
    input: CreateAccountHolderInput
  ): Promise<CreateAccountHolderOutput> {
    return { id: input.context.customer.id }
  }

  async deleteAccountHolder(
    _: DeleteAccountHolderInput
  ): Promise<DeleteAccountHolderOutput> {
    return { data: {} }
  }

  async refundPayment(_: RefundPaymentInput): Promise<RefundPaymentOutput> {
    return { data: {} }
  }

  async cancelPayment(_: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: {} }
  }

  async getWebhookActionAndData(
    _: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

export default ManualPaymentProviderService
