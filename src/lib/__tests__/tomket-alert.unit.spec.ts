import { describe, expect, it, jest } from "@jest/globals"

import {
  buildTomketFailureAlert,
  sendTomketFailureAlert,
  TOMKET_ALERT_EMAIL_ENV,
} from "../tomket-alert"

const containerWith = (createNotifications: (...args: unknown[]) => unknown) => ({
  resolve: (key: string) =>
    key === "logger"
      ? { warn: jest.fn(), error: jest.fn() }
      : { createNotifications },
}) as unknown as Parameters<typeof sendTomketFailureAlert>[0]

describe("buildTomketFailureAlert", () => {
  it("names the order, the reason, the details and the admin link", () => {
    const alert = buildTomketFailureAlert({
      orderId: "order_1",
      displayId: 97,
      reason: "a Tomket API elutasította a rendelést",
      details: ["gumi 139734 × 4: Tomket API error 308: error 308"],
    })
    expect(alert.subject).toBe("Tomket továbbítás sikertelen – #97")
    expect(alert.text).toContain("error 308")
    expect(alert.text).toContain("https://admin.teherguminet.hu/app/orders/order_1")
  })
})

describe("sendTomketFailureAlert", () => {
  it("e-mails TOMKET_ALERT_EMAIL", async () => {
    process.env[TOMKET_ALERT_EMAIL_ENV] = "owner@example.com"
    const create = jest.fn(async () => [])
    const sent = await sendTomketFailureAlert(containerWith(create), {
      orderId: "order_1",
      reason: "x",
    })
    expect(sent).toBe(true)
    const [[payload]] = create.mock.calls as unknown as [[Array<Record<string, unknown>>]]
    expect(payload[0]).toMatchObject({ to: "owner@example.com", channel: "email" })
  })

  it("does nothing without a recipient and never throws on a send failure", async () => {
    delete process.env[TOMKET_ALERT_EMAIL_ENV]
    const create = jest.fn(async () => [])
    expect(await sendTomketFailureAlert(containerWith(create), { reason: "x" })).toBe(false)
    expect(create).not.toHaveBeenCalled()

    process.env[TOMKET_ALERT_EMAIL_ENV] = "owner@example.com"
    const failing = jest.fn(async () => {
      throw new Error("resend down")
    })
    expect(await sendTomketFailureAlert(containerWith(failing), { reason: "x" })).toBe(false)
  })
})
