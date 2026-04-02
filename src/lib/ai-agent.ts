import { z } from "@medusajs/framework/zod"

export const DEFAULT_CODEX_TRANSLATE_MODEL = "gpt-5.3-codex"
export const DEFAULT_CODEX_SIDECAR_URL = "http://codex-sidecar:3210"
export const DEFAULT_CODEX_LOGIN_COMMAND =
  "docker compose exec codex-sidecar codex login --device-auth"

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return ""
  }

  return value.trim()
}

const readSidecarBaseUrl = () =>
  normalizeString(process.env.AI_AGENT_CODEX_SIDECAR_URL) ||
  DEFAULT_CODEX_SIDECAR_URL

const readTranslateModel = () =>
  normalizeString(process.env.AI_AGENT_CODEX_MODEL) ||
  DEFAULT_CODEX_TRANSLATE_MODEL

const readLoginCommand = () =>
  normalizeString(process.env.AI_AGENT_CODEX_LOGIN_COMMAND) ||
  DEFAULT_CODEX_LOGIN_COMMAND

const readErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as {
      message?: string
      error?: string
    }

    const message = normalizeString(payload?.message || payload?.error)
    if (message) {
      return message
    }
  } catch {
    // ignore parse issues
  }

  return fallback
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

export type AiAgentStatus = {
  provider: "codex-cli"
  model: string
  connected: boolean
  sidecar_url: string
  remediation_command: string
  message?: string
}

export type AiAgentAuthState =
  | "idle"
  | "pending"
  | "connected"
  | "failed"
  | "expired"

export type AiAgentAuthStatus = {
  provider: "codex-cli"
  model: string
  connected: boolean
  state: AiAgentAuthState
  sidecar_url: string
  remediation_command: string
  verification_url?: string
  user_code?: string
  started_at?: string
  completed_at?: string
  expires_at?: string
  message?: string
}

const normalizeAuthState = (value: unknown): AiAgentAuthState => {
  const normalized = normalizeString(value)

  if (
    normalized === "idle" ||
    normalized === "pending" ||
    normalized === "connected" ||
    normalized === "failed" ||
    normalized === "expired"
  ) {
    return normalized
  }

  return "idle"
}

const toAiAgentAuthStatus = (
  payload: Record<string, unknown> | undefined
): AiAgentAuthStatus => {
  const model = normalizeString(payload?.model) || readTranslateModel()
  const connected = payload?.connected === true
  const state = normalizeAuthState(payload?.state)

  return {
    provider: "codex-cli",
    model,
    connected,
    state: connected ? "connected" : state,
    sidecar_url: readSidecarBaseUrl(),
    remediation_command: normalizeString(payload?.remediation_command) || readLoginCommand(),
    verification_url: normalizeString(payload?.verification_url) || undefined,
    user_code: normalizeString(payload?.user_code) || undefined,
    started_at: normalizeString(payload?.started_at) || undefined,
    completed_at: normalizeString(payload?.completed_at) || undefined,
    expires_at: normalizeString(payload?.expires_at) || undefined,
    message: normalizeString(payload?.message) || undefined,
  }
}

export const getAiAgentStatus = async (): Promise<AiAgentStatus> => {
  const model = readTranslateModel()
  const sidecarUrl = readSidecarBaseUrl()
  const remediationCommand = readLoginCommand()

  try {
    const response = await fetch(`${sidecarUrl}/health`, {
      method: "GET",
      cache: "no-store",
    })

    if (!response.ok) {
      const message = await readErrorMessage(
        response,
        "A Codex sidecar nem elérhető."
      )

      return {
        provider: "codex-cli",
        model,
        connected: false,
        sidecar_url: sidecarUrl,
        remediation_command: remediationCommand,
        message,
      }
    }

    const payload = (await response.json()) as {
      status?: {
        model?: unknown
        connected?: unknown
        message?: unknown
      }
    }

    const connected = payload?.status?.connected === true
    const resolvedModel =
      normalizeString(payload?.status?.model) || readTranslateModel()
    const statusMessage = normalizeString(payload?.status?.message)

    return {
      provider: "codex-cli",
      model: resolvedModel,
      connected,
      sidecar_url: sidecarUrl,
      remediation_command: remediationCommand,
      message: statusMessage || undefined,
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length
        ? `A Codex sidecar nem elérhető: ${error.message}`
        : "A Codex sidecar nem elérhető."

    return {
      provider: "codex-cli",
      model,
      connected: false,
      sidecar_url: sidecarUrl,
      remediation_command: remediationCommand,
      message,
    }
  }
}

export const startAiAgentAuth = async (): Promise<AiAgentAuthStatus> => {
  const sidecarUrl = readSidecarBaseUrl()

  try {
    const response = await fetch(`${sidecarUrl}/auth/start`, {
      method: "POST",
      cache: "no-store",
    })

    if (!response.ok) {
      const message = await readErrorMessage(
        response,
        "Nem sikerült elindítani a Codex bejelentkezést."
      )
      throw new Error(message)
    }

    const payload = (await response.json()) as {
      status?: Record<string, unknown>
    }

    return toAiAgentAuthStatus(payload?.status)
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length
        ? `A Codex bejelentkezés indítása sikertelen: ${error.message}`
        : "A Codex bejelentkezés indítása sikertelen."

    return {
      provider: "codex-cli",
      model: readTranslateModel(),
      connected: false,
      state: "failed",
      sidecar_url: sidecarUrl,
      remediation_command: readLoginCommand(),
      message,
    }
  }
}

export const getAiAgentAuthStatus = async (): Promise<AiAgentAuthStatus> => {
  const sidecarUrl = readSidecarBaseUrl()

  try {
    const response = await fetch(`${sidecarUrl}/auth/status`, {
      method: "GET",
      cache: "no-store",
    })

    if (!response.ok) {
      const message = await readErrorMessage(
        response,
        "Nem sikerült lekérni a Codex bejelentkezés állapotát."
      )
      throw new Error(message)
    }

    const payload = (await response.json()) as {
      status?: Record<string, unknown>
    }

    return toAiAgentAuthStatus(payload?.status)
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length
        ? `A Codex sidecar nem elérhető: ${error.message}`
        : "A Codex sidecar nem elérhető."

    return {
      provider: "codex-cli",
      model: readTranslateModel(),
      connected: false,
      state: "failed",
      sidecar_url: sidecarUrl,
      remediation_command: readLoginCommand(),
      message,
    }
  }
}

export const translateHuToSk = async (
  input: TranslateHuToSkInput
): Promise<TranslateHuToSkOutput> => {
  const model = readTranslateModel()
  const sidecarUrl = readSidecarBaseUrl()

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

  const response = await fetch(`${sidecarUrl}/translate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title_hu: titleHu,
      description_hu: descriptionHu,
      translate_title: shouldTranslateTitle,
      translate_description: shouldTranslateDescription,
      model,
    }),
  })

  if (!response.ok) {
    const fallback =
      response.status === 401
        ? "CODEX_AUTH_REQUIRED: A Codex CLI nincs bejelentkezve."
        : response.status === 503
          ? "CODEX_SIDECAR_UNAVAILABLE: A Codex sidecar nem elérhető."
          : "Nem sikerült fordítást kérni a Codex sidecar szolgáltatástól."

    const message = await readErrorMessage(response, fallback)
    throw new Error(message)
  }

  const payload = (await response.json()) as unknown
  const parsed = normalizeTranslationResponse.parse(payload)

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
