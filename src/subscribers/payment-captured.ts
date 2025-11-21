import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { PaymentEvents } from "@medusajs/utils"

import { sendPaymentReceiptWorkflow } from "../workflows/send-payment-receipt"

export default async function paymentCapturedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (!data?.id) {
    return
  }

  await sendPaymentReceiptWorkflow(container).run({
    input: {
      paymentId: data.id,
    },
  })
}

export const config: SubscriberConfig = {
  event: PaymentEvents.CAPTURED,
}
