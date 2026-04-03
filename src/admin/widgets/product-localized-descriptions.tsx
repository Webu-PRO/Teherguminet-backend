import { useCallback, useEffect, useMemo, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Input, Text, Textarea, toast } from "@medusajs/ui"

import { sdk } from "../lib/client"
import { normalizeText } from "../../lib/product-localization"

type ProductData = {
  id: string
  title?: string | null
  description?: string | null
}

type FieldSource = "db" | "metadata" | "default" | "empty"

type LocalizationResponse = {
  ok: boolean
  product_id: string
  values?: {
    title_hu?: string
    title_sk?: string
    description_hu?: string
    description_sk?: string
  }
  sources?: {
    title_hu?: FieldSource
    title_sk?: FieldSource
    description_hu?: FieldSource
    description_sk?: FieldSource
  }
  defaults?: {
    title?: string
    description?: string
  }
}

type WidgetProps = {
  data: ProductData
}

const getSourceBadgeText = (source: FieldSource | undefined) => {
  switch (source) {
    case "db":
      return "Mentett lokalizáció"
    case "metadata":
      return "Régi metadata"
    case "default":
      return "Termék alapérték"
    default:
      return "Nincs érték"
  }
}

const getSourceBadgeClass = (source: FieldSource | undefined) => {
  switch (source) {
    case "db":
      return "bg-ui-tag-green-bg text-ui-tag-green-text"
    case "metadata":
      return "bg-ui-tag-orange-bg text-ui-tag-orange-text"
    case "default":
      return "bg-ui-tag-blue-bg text-ui-tag-blue-text"
    default:
      return "bg-ui-tag-neutral-bg text-ui-tag-neutral-text"
  }
}

const readErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim().length) {
    return error.message
  }

  if (
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message.trim()
    if (message.length) {
      return message
    }
  }

  return fallback
}

const ProductLocalizedDescriptionsWidget = ({ data }: WidgetProps) => {
  const productId = data.id

  const [titleHu, setTitleHu] = useState("")
  const [titleSk, setTitleSk] = useState("")
  const [descriptionHu, setDescriptionHu] = useState("")
  const [descriptionSk, setDescriptionSk] = useState("")

  const [sourceTitleHu, setSourceTitleHu] = useState<FieldSource>("empty")
  const [sourceTitleSk, setSourceTitleSk] = useState<FieldSource>("empty")
  const [sourceDescriptionHu, setSourceDescriptionHu] = useState<FieldSource>("empty")
  const [sourceDescriptionSk, setSourceDescriptionSk] = useState<FieldSource>("empty")

  const [fallbackTitle, setFallbackTitle] = useState("")
  const [fallbackDescription, setFallbackDescription] = useState("")

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const effectiveFallbackTitle = useMemo(() => {
    return normalizeText(fallbackTitle) || normalizeText(data.title) || "-"
  }, [data.title, fallbackTitle])

  const effectiveFallbackDescription = useMemo(() => {
    return normalizeText(fallbackDescription) || normalizeText(data.description) || "-"
  }, [data.description, fallbackDescription])

  const loadLocalization = useCallback(async () => {
    if (!productId) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const payload = (await sdk.client.fetch(
        `/admin/products/${encodeURIComponent(productId)}/localization`,
        {
          method: "GET",
        }
      )) as LocalizationResponse

      setTitleHu(normalizeText(payload?.values?.title_hu))
      setTitleSk(normalizeText(payload?.values?.title_sk))
      setDescriptionHu(normalizeText(payload?.values?.description_hu))
      setDescriptionSk(normalizeText(payload?.values?.description_sk))

      setSourceTitleHu(payload?.sources?.title_hu ?? "empty")
      setSourceTitleSk(payload?.sources?.title_sk ?? "empty")
      setSourceDescriptionHu(payload?.sources?.description_hu ?? "empty")
      setSourceDescriptionSk(payload?.sources?.description_sk ?? "empty")

      setFallbackTitle(normalizeText(payload?.defaults?.title))
      setFallbackDescription(normalizeText(payload?.defaults?.description))
    } catch (error) {
      const message = readErrorMessage(
        error,
        "Nem sikerült betölteni a termék lokalizált adatait."
      )
      toast.error("Lokalizált termék adatok", {
        description: message,
      })
    } finally {
      setIsLoading(false)
    }
  }, [productId])

  useEffect(() => {
    void loadLocalization()
  }, [loadLocalization])

  const handleSave = useCallback(async () => {
    if (!productId || isSaving) {
      return
    }

    setIsSaving(true)
    try {
      await sdk.client.fetch(
        `/admin/products/${encodeURIComponent(productId)}/localization`,
        {
          method: "PATCH",
          body: {
            title_hu: normalizeText(titleHu),
            title_sk: normalizeText(titleSk),
            description_hu: normalizeText(descriptionHu),
            description_sk: normalizeText(descriptionSk),
          },
        }
      )

      toast.success("Lokalizált termék adatok", {
        description: "Sikeres mentés az adatbázisba.",
      })

      await loadLocalization()
    } catch (error) {
      const message = readErrorMessage(
        error,
        "Nem sikerült menteni a lokalizált adatokat."
      )
      toast.error("Lokalizált termék adatok", {
        description: message,
      })
    } finally {
      setIsSaving(false)
    }
  }, [
    descriptionHu,
    descriptionSk,
    isSaving,
    loadLocalization,
    productId,
    titleHu,
    titleSk,
  ])

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-4 px-6 py-4">
        <div>
          <Text size="small" leading="compact" weight="plus">
            Lokalizált termék adatok (HU / SK)
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle mt-1">
            SK feed: <code>title_sk</code> + <code>description_sk</code>. HU feed:{" "}
            <code>title_hu</code> + <code>description_hu</code>.
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            SK hiány esetén a feed HU értékre esik vissza.
          </Text>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
            <div className="mb-3 flex items-center justify-between">
              <Text size="small" weight="plus">
                HU forrás
              </Text>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${getSourceBadgeClass(
                  sourceTitleHu
                )}`}
              >
                {getSourceBadgeText(sourceTitleHu)}
              </span>
            </div>

            <div className="flex flex-col gap-y-2">
              <Text size="xsmall" weight="plus">
                Cím (HU)
              </Text>
              <Input
                value={titleHu}
                onChange={(event) => setTitleHu(event.target.value)}
                placeholder="Magyar cím..."
                disabled={isLoading || isSaving}
              />
            </div>

            <div className="mt-3 flex flex-col gap-y-2">
              <Text size="xsmall" weight="plus">
                Leírás (HU)
              </Text>
              <Textarea
                value={descriptionHu}
                onChange={(event) => setDescriptionHu(event.target.value)}
                placeholder="Magyar leírás..."
                rows={8}
                disabled={isLoading || isSaving}
              />
            </div>

            <div className="mt-3 rounded-md border border-ui-border-base bg-ui-bg-base p-2">
              <Text size="xsmall" className="text-ui-fg-subtle">
                Alap cím: {effectiveFallbackTitle}
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle mt-1 whitespace-pre-wrap">
                Alap leírás: {effectiveFallbackDescription}
              </Text>
            </div>
          </div>

          <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
            <div className="mb-3 flex items-center justify-between">
              <Text size="small" weight="plus">
                SK fordítás
              </Text>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${getSourceBadgeClass(
                  sourceTitleSk
                )}`}
              >
                {getSourceBadgeText(sourceTitleSk)}
              </span>
            </div>

            <div className="flex flex-col gap-y-2">
              <Text size="xsmall" weight="plus">
                Názov (SK)
              </Text>
              <Input
                value={titleSk}
                onChange={(event) => setTitleSk(event.target.value)}
                placeholder="Slovenský názov..."
                disabled={isLoading || isSaving}
              />
            </div>

            <div className="mt-3 flex flex-col gap-y-2">
              <div className="flex items-center justify-between">
                <Text size="xsmall" weight="plus">
                  Popis (SK)
                </Text>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${getSourceBadgeClass(
                    sourceDescriptionSk
                  )}`}
                >
                  {getSourceBadgeText(sourceDescriptionSk)}
                </span>
              </div>
              <Textarea
                value={descriptionSk}
                onChange={(event) => setDescriptionSk(event.target.value)}
                placeholder="Slovenský popis..."
                rows={8}
                disabled={isLoading || isSaving}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="small"
            onClick={() => void handleSave()}
            isLoading={isSaving}
            disabled={isLoading || isSaving}
          >
            Mentés
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => void loadLocalization()}
            disabled={isLoading || isSaving}
          >
            Frissítés
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductLocalizedDescriptionsWidget
