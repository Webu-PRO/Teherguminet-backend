import {
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import {
  sendAbandonedNotificationsStep,
  type AbandonedCart,
} from "./steps/send-abandoned-notifications"
import { updateCartsStep } from "@medusajs/medusa/core-flows"

export type SendAbandonedCartsWorkflowInput = {
  carts: AbandonedCart[]
}

export const sendAbandonedCartsWorkflow = createWorkflow(
  "send-abandoned-carts",
  (input: SendAbandonedCartsWorkflowInput) => {
    sendAbandonedNotificationsStep(input)

    const updateInput = transform(
      input,
      (data) =>
        data.carts.map((cart) => ({
          id: cart.id,
          metadata: {
            ...(cart.metadata ?? {}),
            abandoned_notification: new Date().toISOString(),
          },
        }))
    )

    const updatedCarts = updateCartsStep(updateInput)

    return new WorkflowResponse(updatedCarts)
  }
)
