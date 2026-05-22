import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type { ICustomerModuleService, Logger } from "@medusajs/types"
import { randomBytes } from "node:crypto"

/**
 * POST /store/newsletter
 *
 * Persists a newsletter signup as a Medusa guest customer (has_account=false)
 * with marketing-consent metadata. The frontend posts here via
 * /api/newsletter (storefront proxy).
 *
 * Body: { email: string, source?: string, locale?: 'hu'|'sk' }
 *
 * NOTE: For full GDPR compliance this should send a double-opt-in confirmation
 * email and only flip newsletter_consent to 'confirmed' on click-through.
 * That confirmation email lives in the email sequences task (P2.1). For v1 we
 * record consent at signup time and rely on the unsubscribe link in every
 * outgoing email (also wired in P2.1).
 */

const MAX_EMAIL_LENGTH = 200
const MAX_SOURCE_LENGTH = 60
const SUPPORTED_LOCALES = new Set(["hu", "sk"])

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const normalize = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : ""

type Payload = {
  email?: string
  source?: string
  locale?: string
}

export async function POST(
  req: MedusaRequest<Payload>,
  res: MedusaResponse
) {
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const body = (req.body ?? {}) as Payload

  const email = normalize(body.email, MAX_EMAIL_LENGTH).toLowerCase()
  const source = normalize(body.source, MAX_SOURCE_LENGTH) || "footer"
  const localeRaw = normalize(body.locale, 4).toLowerCase()
  const locale = SUPPORTED_LOCALES.has(localeRaw) ? localeRaw : "hu"

  if (!email || !isValidEmail(email)) {
    res.status(400).json({ error: "Invalid email address" })
    return
  }

  const customerService = req.scope.resolve<ICustomerModuleService>(
    Modules.CUSTOMER
  )

  try {
    const existing = await customerService.listCustomers(
      { email },
      { take: 1, select: ["id", "email", "metadata", "has_account"] }
    )

    const subscribedAtIso = new Date().toISOString()
    const confirmationToken = randomBytes(24).toString("hex")

    const newsletterMetadata = {
      newsletter_subscribed: true,
      newsletter_consent: "pending" as const,
      newsletter_source: source,
      newsletter_locale: locale,
      newsletter_subscribed_at: subscribedAtIso,
      newsletter_confirmation_token: confirmationToken,
    }

    if (existing.length > 0) {
      const customer = existing[0]
      const mergedMetadata = {
        ...(customer.metadata ?? {}),
        ...newsletterMetadata,
        // Preserve existing confirmed state if already confirmed.
        newsletter_consent:
          (customer.metadata as any)?.newsletter_consent === "confirmed"
            ? "confirmed"
            : "pending",
      }
      await customerService.updateCustomers(customer.id, {
        metadata: mergedMetadata,
      })
    } else {
      await customerService.createCustomers({
        email,
        has_account: false,
        metadata: newsletterMetadata,
      })
    }

    // TODO (P2.1): emit "newsletter.subscribed" event and send double-opt-in
    // confirmation email via the notification module. For now we log so ops
    // can observe signups in real time.
    logger.info(
      `Newsletter signup: ${email} (source=${source}, locale=${locale})`
    )

    res.status(200).json({ ok: true })
  } catch (err: any) {
    logger.error(
      `Newsletter signup failed for ${email}: ${err?.message ?? "unknown error"}`
    )
    res.status(500).json({ error: "Subscription failed. Please try again." })
  }
}
