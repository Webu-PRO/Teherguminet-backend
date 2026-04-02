import { z } from "@medusajs/framework/zod"

export const DEFAULT_OPENAI_TRANSLATE_MODEL = "gpt-5"

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return ""
  }

  return value.trim()
}

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

const extractOutputText = (payload: unknown) => {
  const payloadRecord = toRecord(payload)
  const directOutputText = normalizeString(payloadRecord.output_text)

  if (directOutputText) {
    return directOutputText
  }

  const output = Array.isArray(payloadRecord.output) ? payloadRecord.output : []

  for (const entry of output) {
    const message = toRecord(entry)
    const content = Array.isArray(message.content) ? message.content : []

    for (const item of content) {
      const contentItem = toRecord(item)
      if (contentItem.type !== "output_text") {
        continue
      }

      const itemText = normalizeString(contentItem.text)
      if (itemText) {
        return itemText
      }
    }
  }

  return ""
}

const normalizeTranslationResponse = z
  .object({
    title_sk: z.string().trim().default(""),
    description_sk: z.string().trim().default(""),
  })
  .strict()

export type TranslateHuToSkInput = {
  title_hu?: string
  description_hu?: string
  title_sk?: string
  description_sk?: string
  overwrite?: boolean
}

export type TranslateHuToSkOutput = {
  title_sk: string
  description_sk: string
  translated_fields: Array<"title_sk" | "description_sk">
  skipped_fields: Array<"title_sk" | "description_sk">
  model: string
}

export const getAiAgentStatus = () => {
  const apiKey = normalizeString(process.env.OPENAI_API_KEY)
  const model =
    normalizeString(process.env.OPENAI_TRANSLATE_MODEL) ||
    DEFAULT_OPENAI_TRANSLATE_MODEL

  return {
    provider: "openai",
    model,
    connected: Boolean(apiKey),
  }
}

const buildTranslationPrompt = (input: {
  title_hu: string
  description_hu: string
  translate_title: boolean
  translate_description: boolean
}) => {
  return JSON.stringify(input)
}

const parseTranslationOutput = (rawText: string) => {
  const parsed = JSON.parse(rawText) as unknown
  return normalizeTranslationResponse.parse(parsed)
}

export const translateHuToSk = async (
  input: TranslateHuToSkInput
): Promise<TranslateHuToSkOutput> => {
  const apiKey = normalizeString(process.env.OPENAI_API_KEY)
  const model =
    normalizeString(process.env.OPENAI_TRANSLATE_MODEL) ||
    DEFAULT_OPENAI_TRANSLATE_MODEL

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY hiányzik. Állítsd be az API kulcsot a backend .env fájlban."
    )
  }

  const titleHu = normalizeString(input.title_hu)
  const descriptionHu = normalizeString(input.description_hu)
  const currentTitleSk = normalizeString(input.title_sk)
  const currentDescriptionSk = normalizeString(input.description_sk)
  const overwrite = input.overwrite === true

  const shouldTranslateTitle = Boolean(titleHu) && (overwrite || !currentTitleSk)
  const shouldTranslateDescription = Boolean(descriptionHu) &&
    (overwrite || !currentDescriptionSk)

  if (!shouldTranslateTitle && !shouldTranslateDescription) {
    return {
      title_sk: currentTitleSk,
      description_sk: currentDescriptionSk,
      translated_fields: [],
      skipped_fields: ["title_sk", "description_sk"],
      model,
    }
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are a professional ecommerce translator. Translate Hungarian (HU) text to Slovak (SK). Keep brand names, tire sizes, SKUs, numbers, punctuation style and technical abbreviations intact. Return JSON only.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildTranslationPrompt({
                title_hu: titleHu,
                description_hu: descriptionHu,
                translate_title: shouldTranslateTitle,
                translate_description: shouldTranslateDescription,
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
  })

  if (!response.ok) {
    let details = ""

    try {
      const payload = (await response.json()) as { error?: { message?: string } }
      details = normalizeString(payload?.error?.message)
    } catch {
      // ignore parse errors
    }

    throw new Error(
      details || "Nem sikerült fordítást kérni az OpenAI API-tól."
    )
  }

  const payload = (await response.json()) as unknown
  const outputText = extractOutputText(payload)

  if (!outputText) {
    throw new Error("Az AI válasz üres volt.")
  }

  const parsed = parseTranslationOutput(outputText)

  const nextTitleSk = shouldTranslateTitle
    ? normalizeString(parsed.title_sk)
    : currentTitleSk
  const nextDescriptionSk = shouldTranslateDescription
    ? normalizeString(parsed.description_sk)
    : currentDescriptionSk

  const translatedFields: Array<"title_sk" | "description_sk"> = []
  const skippedFields: Array<"title_sk" | "description_sk"> = []

  if (shouldTranslateTitle) {
    translatedFields.push("title_sk")
  } else {
    skippedFields.push("title_sk")
  }

  if (shouldTranslateDescription) {
    translatedFields.push("description_sk")
  } else {
    skippedFields.push("description_sk")
  }

  return {
    title_sk: nextTitleSk,
    description_sk: nextDescriptionSk,
    translated_fields: translatedFields,
    skipped_fields: skippedFields,
    model,
  }
}
