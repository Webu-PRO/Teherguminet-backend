type RevalidateLogger = {
  info: (message: string) => void
  warn: (message: string) => void
}

/**
 * Ping the storefront after a catalogue import so its size/brand facet cache
 * (tire-facets tag, hourly TTL) refreshes immediately. Fire-and-forget by
 * design: a miss only means the facets refresh on the TTL instead, so this
 * must never fail an import.
 *
 * Needs STOREFRONT_REVALIDATE_URL (e.g. https://teherguminet.hu/api/revalidate-facets)
 * and REVALIDATE_SECRET (same value the storefront holds).
 */
export async function notifyStorefrontFacetRevalidate(
  logger: RevalidateLogger
): Promise<void> {
  const url = (process.env.STOREFRONT_REVALIDATE_URL ?? "").trim()
  const secret = (process.env.REVALIDATE_SECRET ?? "").trim()

  if (!url || !secret) {
    logger.info(
      "[tomket] Facet-revalidálás kihagyva (nincs STOREFRONT_REVALIDATE_URL / REVALIDATE_SECRET)."
    )
    return
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-revalidate-secret": secret },
      signal: AbortSignal.timeout(10_000),
    })

    if (res.ok) {
      logger.info("[tomket] Storefront facet cache frissítve.")
    } else {
      logger.warn(`[tomket] Facet-revalidálás HTTP ${res.status}.`)
    }
  } catch (error) {
    logger.warn(
      `[tomket] Facet-revalidálás nem sikerült: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}
