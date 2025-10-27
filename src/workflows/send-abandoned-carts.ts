import {
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import {
  sendAbandonedNotificationsStep,
} from "./steps/send-abandoned-notifications"
import { updateCartsStep } from "@medusajs/medusa/core-flows"
import type {
  CartDTO,
  CustomerDTO,
} from "@medusajs/framework/types"

export type SendAbandonedCartsWorkflowInput = {
  carts: (CartDTO & {
    customer: CustomerDTO | null
  })[]
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
