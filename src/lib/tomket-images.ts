import { createHash } from "crypto"
import { Modules } from "@medusajs/framework/utils"
import type { IFileModuleService, MedusaContainer } from "@medusajs/types"

import { readStoreMetadata, writeStoreMetadata } from "./tomket-status"

/**
 * Tomket serves product photos from img.tomket.com. Hot-linking them is slow
 * for shoppers, breaks whenever the supplier rate-limits or requires a
 * browser User-Agent (it answers 401 without one), and puts the shop's
 * catalogue at the mercy of a third-party CDN. The importer therefore copies
 * each distinct photo once into the shop's own S3 bucket through the file
 * module and points products at that copy.
 *
 * Many tyres share one photo (one per tread pattern), so the copies are
 * cached by source URL in store metadata: a few hundred entries, not one per
 * product.
 */

export const TOMKET_IMAGES_METADATA_KEY = "tomket_images"

const TOMKET_IMAGE_HOST = "img.tomket.com"
const FETCH_TIMEOUT_MS = 20000
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const DEFAULT_CONCURRENCY = 4

/** Some CDNs reject requests with no UA; a browser-like one is accepted. */
const IMAGE_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 teherguminet-tomket-import",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}

export type TomketImageMap = Record<string, string>

export const isTomketImageUrl = (url: string | undefined | null) => {
  if (!url) {
    return false
  }
  try {
    return new URL(url).hostname === TOMKET_IMAGE_HOST
  } catch {
    return false
  }
}

export const hashImageUrl = (url: string) =>
  createHash("sha1").update(url).digest("hex").slice(0, 16)

const extensionFor = (url: string, mimeType: string) => {
  const fromMime: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
  }
  if (fromMime[mimeType]) {
    return fromMime[mimeType]
  }
  const match = /\.(jpe?g|png|webp|gif|avif)$/i.exec(new URL(url).pathname)
  return match ? `.${match[1].toLowerCase().replace("jpeg", "jpg")}` : ".jpg"
}

export const readTomketImageMap = async (
  container: MedusaContainer
): Promise<TomketImageMap> => {
  const stored = await readStoreMetadata(container, TOMKET_IMAGES_METADATA_KEY)
  if (!stored || typeof stored !== "object") {
    return {}
  }
  const map: TomketImageMap = {}
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof value === "string" && value) {
      map[key] = value
    }
  }
  return map
}

export const writeTomketImageMap = (
  container: MedusaContainer,
  map: TomketImageMap
) => writeStoreMetadata(container, TOMKET_IMAGES_METADATA_KEY, map)

export type FetchImage = (
  url: string
) => Promise<{ bytes: Buffer; mimeType: string }>

export const fetchTomketImage: FetchImage = async (url) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: IMAGE_FETCH_HEADERS,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const mimeType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase()
    if (!mimeType.startsWith("image/")) {
      throw new Error(`nem kép (${mimeType || "ismeretlen típus"})`)
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.length) {
      throw new Error("üres válasz")
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new Error(`túl nagy (${Math.round(bytes.length / 1024)} kB)`)
    }

    return { bytes, mimeType }
  } finally {
    clearTimeout(timeout)
  }
}

export type MirrorResult = {
  /** Source URL → shop-hosted URL, for every URL that has a copy now. */
  map: TomketImageMap
  copied: number
  reused: number
  failed: Array<{ url: string; reason: string }>
}

/**
 * Ensures every given Tomket image URL has a copy in the shop's file storage.
 * Already-copied URLs are reused from the cache; failures are reported and
 * the caller keeps the supplier URL for those, so a flaky photo never blocks
 * an import.
 */
export const mirrorTomketImages = async (
  container: MedusaContainer,
  urls: Iterable<string>,
  options: {
    concurrency?: number
    fetchImage?: FetchImage
    onProgress?: (message: string) => void
  } = {}
): Promise<MirrorResult> => {
  const fetchImage = options.fetchImage ?? fetchTomketImage
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const report = options.onProgress ?? (() => {})

  const map = await readTomketImageMap(container)
  const unique = Array.from(new Set(Array.from(urls).filter(isTomketImageUrl)))
  const pending = unique.filter((url) => !map[hashImageUrl(url)])

  const failed: MirrorResult["failed"] = []
  let reused = unique.length - pending.length
  let copied = 0

  if (!pending.length) {
    return { map, copied, reused, failed }
  }

  const fileService = container.resolve<IFileModuleService>(Modules.FILE)
  report(`Képek tükrözése: ${pending.length} új fotó, ${reused} már megvan.`)

  let cursor = 0
  let sinceFlush = 0

  const flush = async () => {
    if (sinceFlush > 0) {
      await writeTomketImageMap(container, map)
      sinceFlush = 0
    }
  }

  const worker = async () => {
    while (cursor < pending.length) {
      const url = pending[cursor++]
      try {
        const { bytes, mimeType } = await fetchImage(url)
        const key = hashImageUrl(url)
        const [file] = await fileService.createFiles([
          {
            filename: `tomket-${key}${extensionFor(url, mimeType)}`,
            mimeType,
            content: bytes.toString("base64"),
          },
        ])
        if (!file?.url) {
          throw new Error("a fájlmodul nem adott vissza URL-t")
        }
        map[key] = file.url
        copied += 1
        sinceFlush += 1
        if (copied % 25 === 0) {
          report(`Képek tükrözése: ${copied}/${pending.length}.`)
        }
      } catch (error) {
        failed.push({
          url,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
      // Persist in slices so a crash mid-way keeps the copies made so far.
      if (sinceFlush >= 50) {
        await flush()
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  await flush()

  if (failed.length) {
    // Name the first reasons: an S3 credential problem looks identical to a
    // flaky CDN from the count alone.
    const reasons = Array.from(new Set(failed.map((entry) => entry.reason))).slice(0, 3)
    report(
      `Figyelem: ${failed.length} fotót nem sikerült átmásolni, ezek a Tomket URL-en maradnak (${reasons.join(" | ")}).`
    )
  }

  return { map, copied, reused, failed }
}

/** The shop-hosted URL for a Tomket photo, or the original when not copied. */
export const resolveMirroredImageUrl = (
  map: TomketImageMap,
  url: string | undefined
) => {
  if (!url || !isTomketImageUrl(url)) {
    return url
  }
  return map[hashImageUrl(url)] ?? url
}
