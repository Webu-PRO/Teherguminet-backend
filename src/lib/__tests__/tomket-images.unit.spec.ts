import {
  hashImageUrl,
  isTomketImageUrl,
  mirrorTomketImages,
  resolveMirroredImageUrl,
} from "../tomket-images"

const state: { metadata: Record<string, unknown>; uploads: string[] } = {
  metadata: {},
  uploads: [],
}

const makeContainer = () =>
  ({
    resolve: (key: string) => {
      if (key === "file") {
        return {
          createFiles: async (files: Array<{ filename: string; mimeType: string; content: string }>) => {
            state.uploads.push(...files.map((f) => f.filename))
            return files.map((f) => ({
              id: `file_${f.filename}`,
              url: `https://bucket.example/uploads/${f.filename}`,
            }))
          },
        }
      }
      return {
        listStores: async () => [{ id: "store_1", metadata: state.metadata }],
        updateStores: async (_id: string, update: { metadata: Record<string, unknown> }) => {
          state.metadata = update.metadata
        },
      }
    },
  }) as never

const A = "https://img.tomket.com/img/ex/pneudetail/barum_brillantis_2.jpg"
const B = "https://img.tomket.com/img/ex/pneudetail/pirelli_pzero.jpg"
const BAD = "https://img.tomket.com/img/ex/pneudetail/missing.jpg"

const fakeFetch = async (url: string) => {
  if (url === BAD) {
    throw new Error("HTTP 404")
  }
  return { bytes: Buffer.from("jpegdata"), mimeType: "image/jpeg" }
}

beforeEach(() => {
  state.metadata = {}
  state.uploads = []
})

describe("isTomketImageUrl", () => {
  it("only accepts the supplier CDN host", () => {
    expect(isTomketImageUrl(A)).toBe(true)
    expect(isTomketImageUrl("https://bucket.example/x.jpg")).toBe(false)
    expect(isTomketImageUrl("not a url")).toBe(false)
    expect(isTomketImageUrl(undefined)).toBe(false)
  })
})

describe("mirrorTomketImages", () => {
  it("copies each distinct photo once, caches it, and keeps failures on the supplier URL", async () => {
    const container = makeContainer()
    const first = await mirrorTomketImages(container, [A, A, B, BAD], {
      fetchImage: fakeFetch,
      concurrency: 2,
    })
    expect(first.copied).toBe(2)
    expect(first.reused).toBe(0)
    expect(first.failed).toEqual([{ url: BAD, reason: "HTTP 404" }])
    expect(state.uploads).toHaveLength(2)
    expect(state.uploads[0]).toMatch(/^tomket-[0-9a-f]{16}\.jpg$/)

    expect(resolveMirroredImageUrl(first.map, A)).toBe(
      `https://bucket.example/uploads/tomket-${hashImageUrl(A)}.jpg`
    )
    expect(resolveMirroredImageUrl(first.map, BAD)).toBe(BAD)
    expect(resolveMirroredImageUrl(first.map, undefined)).toBeUndefined()

    // Persisted for the next run.
    expect(Object.keys(state.metadata.tomket_images as object)).toHaveLength(2)

    const second = await mirrorTomketImages(container, [A, B], { fetchImage: fakeFetch })
    expect(second.copied).toBe(0)
    expect(second.reused).toBe(2)
    expect(state.uploads).toHaveLength(2)
  })

  it("ignores non-Tomket URLs", async () => {
    const result = await mirrorTomketImages(makeContainer(), ["https://bucket.example/own.jpg"], {
      fetchImage: fakeFetch,
    })
    expect(result).toMatchObject({ copied: 0, reused: 0, failed: [] })
    expect(state.uploads).toHaveLength(0)
  })
})

describe("mirrorTomketImages when the upload fails", () => {
  it("keeps the supplier URL and reports the storage error", async () => {
    const container = {
      resolve: (key: string) =>
        key === "file"
          ? {
              createFiles: async () => {
                throw new Error("The AWS Access Key Id you provided does not exist in our records.")
              },
            }
          : {
              listStores: async () => [{ id: "store_1", metadata: {} }],
              updateStores: async () => undefined,
            },
    } as never
    const messages: string[] = []
    const result = await mirrorTomketImages(container, [A], {
      fetchImage: fakeFetch,
      onProgress: (message) => messages.push(message),
    })
    expect(result.copied).toBe(0)
    expect(result.failed[0].reason).toMatch(/AWS Access Key/)
    expect(resolveMirroredImageUrl(result.map, A)).toBe(A)
    expect(messages.at(-1)).toMatch(/nem sikerült átmásolni .*AWS Access Key/)
  })
})
