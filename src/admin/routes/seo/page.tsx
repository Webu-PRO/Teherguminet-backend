import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowDownTray, MagnifyingGlass, PlusMini, Trash } from "@medusajs/icons"
import { Button, Container, Input, Text, Textarea, toast } from "@medusajs/ui"

import { sdk } from "../../lib/client"
import {
  getDefaultSeoSettings,
  isValidJsonString,
  normalizeSeoSettings,
  type SeoSettings,
  type SeoSocialEntry,
} from "../../../lib/seo-settings"

type SeoSettingsResponse = {
  settings?: unknown
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

const serializeSettings = (value: SeoSettings) => JSON.stringify(value)

const SeoSettingsPage = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [savedSettings, setSavedSettings] = useState<SeoSettings>(() =>
    getDefaultSeoSettings()
  )
  const [formSettings, setFormSettings] = useState<SeoSettings>(() =>
    getDefaultSeoSettings()
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  const isDirty = useMemo(
    () => serializeSettings(formSettings) !== serializeSettings(savedSettings),
    [formSettings, savedSettings]
  )

  const updateField = useCallback(
    <K extends keyof SeoSettings>(field: K, value: SeoSettings[K]) => {
      setFormSettings((current) => ({
        ...current,
        [field]: value,
      }))
    },
    []
  )

  const loadSettings = useCallback(async () => {
    setIsLoading(true)

    try {
      const payload = (await sdk.client.fetch(
        "/admin/seo-settings",
        {
          method: "GET",
        }
      )) as SeoSettingsResponse
      const normalized = normalizeSeoSettings(payload.settings)

      setSavedSettings(normalized)
      setFormSettings(normalized)
    } catch (error) {
      const message = readErrorMessage(
        error,
        "Nem sikerült betölteni az SEO beállításokat."
      )
      toast.error("SEO", {
        description: message,
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const handleAddMetaSocialField = useCallback(() => {
    setFormSettings((current) => ({
      ...current,
      metaSocial: [...current.metaSocial, { key: "", value: "" }],
    }))
  }, [])

  const handleMetaSocialChange = useCallback(
    (index: number, patch: Partial<SeoSocialEntry>) => {
      setFormSettings((current) => ({
        ...current,
        metaSocial: current.metaSocial.map((entry, entryIndex) =>
          entryIndex === index
            ? {
                ...entry,
                ...patch,
              }
            : entry
        ),
      }))
    },
    []
  )

  const handleRemoveMetaSocialField = useCallback((index: number) => {
    setFormSettings((current) => ({
      ...current,
      metaSocial: current.metaSocial.filter((_, entryIndex) => entryIndex !== index),
    }))
  }, [])

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      const firstFile = files?.[0]
      if (!firstFile) {
        return
      }

      setIsUploadingImage(true)

      try {
        const payload = (await sdk.admin.upload.create({
          files: [firstFile],
        })) as {
          files?: Array<{ url?: string }>
        }
        const uploadedUrl = payload.files?.[0]?.url?.trim()

        if (!uploadedUrl) {
          throw new Error("A feltöltés sikeres volt, de nem érkezett URL.")
        }

        updateField("metaImageUrl", uploadedUrl)
        toast.success("SEO", {
          description: "Meta kép feltöltve.",
        })
      } catch (error) {
        const message = readErrorMessage(error, "Nem sikerült feltölteni a meta képet.")
        toast.error("SEO", {
          description: message,
        })
      } finally {
        setIsUploadingImage(false)

        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
      }
    },
    [updateField]
  )

  const handleDrop = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (isUploadingImage || isLoading || isSaving) {
        return
      }

      void handleFileSelect(event.dataTransfer.files)
    },
    [handleFileSelect, isLoading, isSaving, isUploadingImage]
  )

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (isSaving || isUploadingImage) {
        return
      }

      const structuredDataTrimmed = formSettings.structuredData.trim()
      if (structuredDataTrimmed && !isValidJsonString(structuredDataTrimmed)) {
        toast.error("SEO", {
          description: "A Structured Data mező csak érvényes JSON lehet.",
        })
        return
      }

      setIsSaving(true)
      try {
        const payload = (await sdk.client.fetch("/admin/seo-settings", {
          method: "PATCH",
          body: {
            ...formSettings,
            metaSocial: formSettings.metaSocial,
          },
        })) as SeoSettingsResponse

        const normalized = normalizeSeoSettings(payload.settings)
        setSavedSettings(normalized)
        setFormSettings(normalized)

        toast.success("SEO", {
          description: "SEO beállítások mentve.",
        })
      } catch (error) {
        const message = readErrorMessage(
          error,
          "Nem sikerült menteni az SEO beállításokat."
        )
        toast.error("SEO", {
          description: message,
        })
      } finally {
        setIsSaving(false)
      }
    },
    [formSettings, isSaving, isUploadingImage]
  )

  const handleReset = useCallback(() => {
    setFormSettings(savedSettings)
  }, [savedSettings])

  return (
    <Container className="p-0">
      <form className="flex flex-col gap-y-4 px-6 py-4" onSubmit={handleSubmit}>
        <div>
          <Text size="small" leading="compact" weight="plus">
            SEO Settings
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle mt-1">
            Global SEO beállítások az admin felületről.
          </Text>
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="small" leading="compact" weight="plus">
            Meta Title
          </Text>
          <Input
            value={formSettings.metaTitle}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateField("metaTitle", event.target.value)
            }
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="small" leading="compact" weight="plus">
            Meta Description
          </Text>
          <Textarea
            value={formSettings.metaDescription}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              updateField("metaDescription", event.target.value)
            }
            rows={4}
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="small" leading="compact" weight="plus">
            Meta Image
          </Text>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            onChange={(event) => {
              void handleFileSelect(event.target.files)
            }}
            hidden
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onDrop={handleDrop}
            disabled={isLoading || isSaving || isUploadingImage}
            className="bg-ui-bg-component border-ui-border-strong transition-fg group flex w-full flex-col items-center gap-y-2 rounded-lg border border-dashed p-8 hover:border-ui-border-interactive focus:border-ui-border-interactive focus:shadow-borders-focus outline-none focus:border-solid disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="text-ui-fg-subtle group-disabled:text-ui-fg-disabled flex items-center gap-x-2">
              <ArrowDownTray />
              <p className="font-normal font-sans txt-medium">
                {isUploadingImage ? "Uploading..." : "Upload"}
              </p>
            </div>
            <p className="font-normal font-sans txt-compact-small text-ui-fg-muted group-disabled:text-ui-fg-disabled text-center">
              Choose images or drag & drop them here.
              <br />
              JPG, JPEG, PNG, and WEBP. Max 20 MB.
            </p>
          </button>
          <Input
            value={formSettings.metaImageUrl}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateField("metaImageUrl", event.target.value)
            }
            placeholder="https://example.com/meta-image.jpg"
            disabled={isLoading || isSaving || isUploadingImage}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="small" leading="compact" weight="plus">
            Meta Social
          </Text>
          <div className="flex flex-col gap-y-2">
            {formSettings.metaSocial.map((entry, index) => (
              <div key={`meta-social-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  value={entry.key}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    handleMetaSocialChange(index, { key: event.target.value })
                  }
                  placeholder="Key (example: og:type)"
                  disabled={isLoading || isSaving}
                />
                <Input
                  value={entry.value}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    handleMetaSocialChange(index, { value: event.target.value })
                  }
                  placeholder="Value"
                  disabled={isLoading || isSaving}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={() => handleRemoveMetaSocialField(index)}
                  disabled={isLoading || isSaving}
                >
                  <Trash />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            size="small"
            variant="secondary"
            onClick={handleAddMetaSocialField}
            disabled={isLoading || isSaving}
          >
            <PlusMini />
            Add Field
          </Button>
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="small" leading="compact" weight="plus">
            Keywords
          </Text>
          <Textarea
            value={formSettings.keywords}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              updateField("keywords", event.target.value)
            }
            rows={4}
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="small" leading="compact" weight="plus">
            Meta Robots
          </Text>
          <Input
            value={formSettings.metaRobots}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateField("metaRobots", event.target.value)
            }
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="small" leading="compact" weight="plus">
            Structured Data
          </Text>
          <Textarea
            value={formSettings.structuredData}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              updateField("structuredData", event.target.value)
            }
            rows={6}
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="small" leading="compact" weight="plus">
            Viewport
          </Text>
          <Input
            value={formSettings.viewport}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateField("viewport", event.target.value)
            }
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="small" leading="compact" weight="plus">
            Canonical URL
          </Text>
          <Input
            value={formSettings.canonicalUrl}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateField("canonicalUrl", event.target.value)
            }
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" size="small" isLoading={isSaving} disabled={isLoading || isSaving || isUploadingImage || !isDirty}>
            Submit
          </Button>
          <Button
            type="button"
            size="small"
            variant="secondary"
            onClick={handleReset}
            disabled={isLoading || isSaving || isUploadingImage}
          >
            Reset
          </Button>
        </div>
      </form>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "SEO",
  icon: MagnifyingGlass,
})

export default SeoSettingsPage
