import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/types"
import { B2B_MODULE } from "@modules/b2b"
import type B2BModuleService from "@modules/b2b/service"

/**
 * POST /store/reseller-application
 *
 * Persists a reseller-program application as a B2B Company with
 * `metadata.reseller_status = 'pending_review'`. The admin reviews these in
 * the standard B2B Companies admin page and manually approves by:
 *   1) creating an Employee linked to the contact's customer record
 *   2) attaching the company to the "Reseller" customer group (which carries
 *      the -12% price list)
 *
 * Admin notification email is sent by the storefront proxy
 * (apps/storefront/src/app/api/reseller-application/route.ts) using the
 * storefront's Resend mailer — avoids duplicating the notification module
 * setup on the backend for this one transactional case.
 */

const COUNTRY_BY_LOCALE: Record<string, string> = {
  hu: "HU",
  sk: "SK",
}
const CURRENCY_BY_LOCALE: Record<string, string> = {
  hu: "huf",
  sk: "eur",
}

type Payload = {
  company_name?: string
  vat_number?: string | null
  contact_name?: string
  email?: string
  phone?: string | null
  monthly_volume?: string | null
  notes?: string | null
  locale?: string
}

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

export async function POST(
  req: MedusaRequest<Payload>,
  res: MedusaResponse
) {
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const body = (req.body ?? {}) as Payload

  const companyName = (body.company_name ?? "").trim()
  const contactName = (body.contact_name ?? "").trim()
  const email = (body.email ?? "").trim().toLowerCase()
  const locale =
    body.locale && (body.locale === "hu" || body.locale === "sk")
      ? body.locale
      : "hu"

  if (!companyName || !contactName || !email || !isValidEmail(email)) {
    res.status(400).json({ error: "Invalid payload" })
    return
  }

  const b2bService: B2BModuleService = req.scope.resolve(B2B_MODULE)

  try {
    // Soft-dedupe: if a Company with this email already exists in pending state
    // we treat the new submission as an update (refresh contact info) rather
    // than creating a duplicate row.
    const existing = await b2bService.listCompanies(
      { email },
      { take: 1 }
    )

    const appliedAt = new Date().toISOString()
    const metadata = {
      reseller_status: "pending_review",
      reseller_applied_at: appliedAt,
      reseller_applied_via: "storefront",
      reseller_locale: locale,
      reseller_contact_name: contactName,
      reseller_vat_number: body.vat_number ?? null,
      reseller_monthly_volume: body.monthly_volume ?? null,
      reseller_notes: body.notes ?? null,
    }

    if (existing.length > 0) {
      const current = existing[0]
      const currentStatus = (current.metadata as any)?.reseller_status
      // If already approved, don't downgrade — just append a note.
      const mergedStatus =
        currentStatus === "approved" ? "approved" : "pending_review"
      await b2bService.updateCompany({
        id: current.id,
        name: companyName,
        phone: body.phone ?? null,
        metadata: {
          ...(current.metadata ?? {}),
          ...metadata,
          reseller_status: mergedStatus,
          reseller_resubmitted_at: appliedAt,
        },
      })
      logger.info(
        `Reseller application resubmitted: ${email} (company=${companyName})`
      )
      res.status(200).json({ ok: true, duplicate: true })
      return
    }

    await b2bService.createCompany({
      name: companyName,
      email,
      phone: body.phone ?? null,
      country: COUNTRY_BY_LOCALE[locale],
      currency_code: CURRENCY_BY_LOCALE[locale],
      approval_settings: { requires_admin_approval: true },
      metadata,
    })

    logger.info(
      `New reseller application: ${email} (company=${companyName}, locale=${locale})`
    )

    res.status(200).json({ ok: true })
  } catch (err: any) {
    logger.error(
      `Reseller application failed for ${email}: ${err?.message ?? "unknown"}`
    )
    res.status(500).json({ error: "Submission failed" })
  }
}
