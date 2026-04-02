import { createServer } from "node:http"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"

const PORT = Number.parseInt(process.env.CODEX_SIDECAR_PORT || "3210", 10)
const MODEL = (process.env.AI_AGENT_CODEX_MODEL || "gpt-5.3-codex").trim()
const LOGIN_COMMAND = (
  process.env.AI_AGENT_CODEX_LOGIN_COMMAND ||
  "docker compose exec codex-sidecar codex login --device-auth"
).trim()
const AUTH_SESSION_DEFAULT_EXPIRY_MS = 15 * 60 * 1000
const AUTH_BOOTSTRAP_WAIT_MS = 1_500

const normalizeString = (value) => {
  if (typeof value !== "string") {
    return ""
  }

  return value.trim()
}

const toRecord = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value
}

const readJsonBody = async (req) => {
  let raw = ""

  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 200_000) {
      throw new Error("Request body too large.")
    }
  }

  if (!raw.trim().length) {
    return {}
  }

  return JSON.parse(raw)
}

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(JSON.stringify(payload))
}

const stripAnsi = (value) =>
  normalizeString(value).replace(/\u001b\[[0-9;]*m/g, "").trim()

const runCommand = ({ cmd, args, timeoutMs = 90_000, cwd }) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let finished = false

    const finalize = (result) => {
      if (finished) {
        return
      }

      finished = true
      clearTimeout(timer)
      resolve(result)
    }

    child.stdout.on("data", (chunk) => {
      if (stdout.length > 1_000_000) {
        return
      }

      stdout += chunk.toString()
    })

    child.stderr.on("data", (chunk) => {
      if (stderr.length > 1_000_000) {
        return
      }

      stderr += chunk.toString()
    })

    child.on("error", (error) => {
      finalize({
        code: 1,
        stdout,
        stderr,
        error,
      })
    })

    child.on("close", (code, signal) => {
      finalize({
        code: code ?? 1,
        signal,
        stdout,
        stderr,
      })
    })

    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      setTimeout(() => {
        child.kill("SIGKILL")
      }, 2_000)

      finalize({
        code: 124,
        stdout,
        stderr,
        timedOut: true,
      })
    }, timeoutMs)
  })

const getAuthStatus = async () => {
  const result = await runCommand({
    cmd: "codex",
    args: ["login", "status"],
    timeoutMs: 15_000,
  })

  const combinedOutput = `${normalizeString(result.stdout)} ${normalizeString(
    result.stderr
  )}`.trim()

  if (result.code === 0) {
    return {
      connected: true,
      message: normalizeString(result.stdout) || "Logged in",
      details: combinedOutput,
    }
  }

  const fallback =
    result.error instanceof Error
      ? result.error.message
      : "A Codex CLI nincs bejelentkezve."

  return {
    connected: false,
    message: normalizeString(result.stderr) || normalizeString(result.stdout) || fallback,
    details: combinedOutput,
  }
}

const getHealthAuthStatus = async () => {
  const authFilePath = path.join(process.env.HOME || "/home/node", ".codex", "auth.json")

  try {
    const raw = await readFile(authFilePath, "utf8")
    if (normalizeString(raw)) {
      return {
        connected: true,
        message: "Codex auth file detected.",
      }
    }
  } catch {
    // ignore file read errors for lightweight health probes
  }

  return {
    connected: false,
    message: "Codex auth file not found.",
  }
}

const getNowIso = () => new Date().toISOString()

const getExpiryIso = (expiresInMs) => new Date(Date.now() + expiresInMs).toISOString()

const createEmptyAuthSession = () => ({
  state: "idle",
  connected: false,
  started_at: "",
  completed_at: "",
  expires_at: "",
  verification_url: "",
  user_code: "",
  message: "",
})

let authSession = createEmptyAuthSession()
let authLoginProcess = null
let authExpiryTimer = null
let authOutput = ""

const setAuthSession = (patch) => {
  authSession = {
    ...authSession,
    ...patch,
  }
}

const clearAuthExpiryTimer = () => {
  if (!authExpiryTimer) {
    return
  }

  clearTimeout(authExpiryTimer)
  authExpiryTimer = null
}

const stopAuthLoginProcess = () => {
  if (!authLoginProcess) {
    return
  }

  authLoginProcess.kill("SIGTERM")
  setTimeout(() => {
    authLoginProcess?.kill("SIGKILL")
  }, 2_000)
}

const getAuthStatusPayload = () => ({
  provider: "codex-cli",
  model: MODEL,
  connected: authSession.connected,
  state: authSession.state,
  verification_url: authSession.verification_url || undefined,
  user_code: authSession.user_code || undefined,
  started_at: authSession.started_at || undefined,
  completed_at: authSession.completed_at || undefined,
  expires_at: authSession.expires_at || undefined,
  remediation_command: LOGIN_COMMAND,
  message: authSession.message || undefined,
})

const extractAuthOutputDetails = (value) => {
  const clean = stripAnsi(value)
  const urls = clean.match(/https?:\/\/[^\s)]+/gi) || []
  const verificationUrl =
    urls.find((candidate) => candidate.toLowerCase().includes("/device")) ||
    urls[0] ||
    ""

  const codeMatch = clean.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4,})\b/)
  const expiryMatch = clean.match(/expires in\s+(\d+)\s+minutes?/i)
  const expiresInMinutes = Number.parseInt(expiryMatch?.[1] || "", 10)

  return {
    verification_url: normalizeString(verificationUrl),
    user_code: normalizeString(codeMatch?.[1] || ""),
    expires_in_ms:
      Number.isFinite(expiresInMinutes) && expiresInMinutes > 0
        ? expiresInMinutes * 60 * 1000
        : null,
  }
}

const updateAuthSessionFromOutput = (outputChunk) => {
  const details = extractAuthOutputDetails(outputChunk)
  let shouldUpdate = false

  if (!authSession.verification_url && details.verification_url) {
    authSession.verification_url = details.verification_url
    shouldUpdate = true
  }

  if (!authSession.user_code && details.user_code) {
    authSession.user_code = details.user_code
    shouldUpdate = true
  }

  if (!authSession.expires_at && details.expires_in_ms) {
    authSession.expires_at = getExpiryIso(details.expires_in_ms)
    clearAuthExpiryTimer()
    authExpiryTimer = setTimeout(() => {
      if (authSession.state !== "pending") {
        return
      }

      setAuthSession({
        state: "expired",
        connected: false,
        completed_at: getNowIso(),
        message: "A bejelentkezési kód lejárt. Indíts új bejelentkezést.",
      })
      stopAuthLoginProcess()
    }, details.expires_in_ms)
    shouldUpdate = true
  }

  if (shouldUpdate && !authSession.message) {
    authSession.message = "Nyisd meg a linket és add meg a kódot a bejelentkezéshez."
  }
}

const syncAuthSessionWithAuthFile = async () => {
  const authStatus = await getHealthAuthStatus()

  if (authStatus.connected) {
    if (!authSession.connected || authSession.state !== "connected") {
      setAuthSession({
        state: "connected",
        connected: true,
        completed_at: authSession.completed_at || getNowIso(),
        message: "Codex sikeresen bejelentkezve.",
      })
    }

    return authStatus
  }

  if (authSession.state === "connected" && !authLoginProcess) {
    authSession = createEmptyAuthSession()
    setAuthSession({
      state: "idle",
      connected: false,
      message: "Codex auth file not found.",
    })
  }

  return authStatus
}

const startAuthSession = async () => {
  const authFileStatus = await syncAuthSessionWithAuthFile()
  if (authFileStatus.connected) {
    return
  }

  if (authLoginProcess && authSession.state === "pending") {
    return
  }

  clearAuthExpiryTimer()
  authOutput = ""
  authSession = createEmptyAuthSession()

  const startedAt = getNowIso()
  setAuthSession({
    state: "pending",
    connected: false,
    started_at: startedAt,
    expires_at: getExpiryIso(AUTH_SESSION_DEFAULT_EXPIRY_MS),
    message: "Bejelentkezési kód generálása...",
  })

  authExpiryTimer = setTimeout(() => {
    if (authSession.state !== "pending") {
      return
    }

    setAuthSession({
      state: "expired",
      connected: false,
      completed_at: getNowIso(),
      message: "A bejelentkezési kód lejárt. Indíts új bejelentkezést.",
    })
    stopAuthLoginProcess()
  }, AUTH_SESSION_DEFAULT_EXPIRY_MS)

  const child = spawn("codex", ["login", "--device-auth"], {
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  authLoginProcess = child

  let bootstrapResolved = false
  let resolveBootstrap = () => {}
  const bootstrapPromise = new Promise((resolve) => {
    resolveBootstrap = resolve
  })

  const markBootstrapped = () => {
    if (bootstrapResolved) {
      return
    }

    bootstrapResolved = true
    resolveBootstrap()
  }

  const appendOutputChunk = (chunk) => {
    const text = chunk.toString()
    if (!text) {
      return
    }

    authOutput += text
    if (authOutput.length > 500_000) {
      authOutput = authOutput.slice(-500_000)
    }

    updateAuthSessionFromOutput(text)
    if (authSession.verification_url && authSession.user_code) {
      setAuthSession({
        message: "Nyisd meg a linket és add meg a kódot a bejelentkezéshez.",
      })
      markBootstrapped()
    }
  }

  child.stdout.on("data", appendOutputChunk)
  child.stderr.on("data", appendOutputChunk)

  child.on("error", (error) => {
    clearAuthExpiryTimer()
    authLoginProcess = null

    setAuthSession({
      state: "failed",
      connected: false,
      completed_at: getNowIso(),
      message:
        error instanceof Error
          ? `A bejelentkezés indítása sikertelen: ${error.message}`
          : "A bejelentkezés indítása sikertelen.",
    })
    markBootstrapped()
  })

  child.on("close", async (code) => {
    clearAuthExpiryTimer()
    authLoginProcess = null

    const syncStatus = await syncAuthSessionWithAuthFile()
    if (syncStatus.connected || code === 0) {
      setAuthSession({
        state: "connected",
        connected: true,
        completed_at: getNowIso(),
        message: "Codex sikeresen bejelentkezve.",
      })
      markBootstrapped()
      return
    }

    if (authSession.state === "expired") {
      markBootstrapped()
      return
    }

    const message =
      stripAnsi(authOutput) ||
      "A Codex bejelentkezés nem sikerült. Próbáld újra."

    setAuthSession({
      state: "failed",
      connected: false,
      completed_at: getNowIso(),
      message,
    })
    markBootstrapped()
  })

  await Promise.race([
    bootstrapPromise,
    new Promise((resolve) => setTimeout(resolve, AUTH_BOOTSTRAP_WAIT_MS)),
  ])
}

const extractJsonObject = (value) => {
  const text = normalizeString(value)

  if (!text) {
    throw new Error("A Codex válasz üres volt.")
  }

  try {
    return JSON.parse(text)
  } catch {
    // continue
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1])
    } catch {
      // continue
    }
  }

  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")

  if (start >= 0 && end > start) {
    const candidate = text.slice(start, end + 1)
    return JSON.parse(candidate)
  }

  throw new Error("A Codex válasz nem érvényes JSON.")
}

const buildPrompt = ({
  title_hu,
  description_hu,
  translate_title,
  translate_description,
}) => {
  return [
    "You are a professional ecommerce translator.",
    "Translate Hungarian (HU) text to Slovak (SK).",
    "Keep brand names, tire sizes, SKUs, numbers, punctuation style, and technical abbreviations unchanged.",
    "Return ONLY a JSON object with exactly these keys: title_sk, description_sk.",
    "If translate_title is false, title_sk must be an empty string.",
    "If translate_description is false, description_sk must be an empty string.",
    "No markdown. No extra keys.",
    "",
    "Input JSON:",
    JSON.stringify({
      title_hu,
      description_hu,
      translate_title,
      translate_description,
    }),
  ].join("\n")
}

const translateViaCodex = async ({
  title_hu,
  description_hu,
  translate_title,
  translate_description,
  model,
}) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "codex-sidecar-"))
  const outputFile = path.join(tmpDir, "last-message.txt")

  try {
    const prompt = buildPrompt({
      title_hu,
      description_hu,
      translate_title,
      translate_description,
    })

    const result = await runCommand({
      cmd: "codex",
      args: [
        "-a",
        "never",
        "exec",
        "--model",
        model,
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--output-last-message",
        outputFile,
        prompt,
      ],
      timeoutMs: 120_000,
    })

    if (result.code !== 0) {
      const errorMessage = normalizeString(result.stderr) ||
        normalizeString(result.stdout) ||
        "A Codex fordítási parancs hibával kilépett."

      const lower = errorMessage.toLowerCase()
      const isAuthIssue =
        lower.includes("login") ||
        lower.includes("not logged") ||
        lower.includes("auth") ||
        lower.includes("401")

      return {
        ok: false,
        statusCode: isAuthIssue ? 401 : 502,
        message: isAuthIssue
          ? `CODEX_AUTH_REQUIRED: ${errorMessage}`
          : `CODEX_EXEC_FAILED: ${errorMessage}`,
      }
    }

    const rawOutput = await readFile(outputFile, "utf8")
    const parsed = extractJsonObject(rawOutput)
    const payload = toRecord(parsed)

    return {
      ok: true,
      title_sk: normalizeString(payload.title_sk),
      description_sk: normalizeString(payload.description_sk),
    }
  } catch (error) {
    return {
      ok: false,
      statusCode: 500,
      message:
        error instanceof Error
          ? `CODEX_EXEC_FAILED: ${error.message}`
          : "CODEX_EXEC_FAILED: Ismeretlen hiba.",
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

const server = createServer(async (req, res) => {
  const method = req.method || "GET"
  const url = req.url || "/"

  if (method === "GET" && url === "/health") {
    const authStatus = await syncAuthSessionWithAuthFile()

    return sendJson(res, 200, {
      ok: true,
      status: {
        provider: "codex-cli",
        model: MODEL,
        connected: authStatus.connected,
        message: authStatus.message,
        remediation_command: LOGIN_COMMAND,
      },
    })
  }

  if (method === "POST" && url === "/auth/start") {
    try {
      await startAuthSession()

      return sendJson(res, 200, {
        ok: true,
        status: getAuthStatusPayload(),
      })
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length
          ? error.message
          : "Nem sikerült elindítani a Codex bejelentkezést."

      return sendJson(res, 500, { message })
    }
  }

  if (method === "GET" && url === "/auth/status") {
    await syncAuthSessionWithAuthFile()

    return sendJson(res, 200, {
      ok: true,
      status: getAuthStatusPayload(),
    })
  }

  if (method === "POST" && url === "/translate") {
    try {
      const body = toRecord(await readJsonBody(req))
      const titleHu = normalizeString(body.title_hu)
      const descriptionHu = normalizeString(body.description_hu)
      const translateTitle = body.translate_title === true
      const translateDescription = body.translate_description === true
      const model = normalizeString(body.model) || MODEL

      if (!translateTitle && !translateDescription) {
        return sendJson(res, 200, {
          title_sk: "",
          description_sk: "",
        })
      }

      if (titleHu.length > 500 || descriptionHu.length > 20_000) {
        return sendJson(res, 400, {
          message: "A fordítandó szöveg túl hosszú.",
        })
      }

      const authStatus = await getAuthStatus()
      if (!authStatus.connected) {
        return sendJson(res, 401, {
          message: `CODEX_AUTH_REQUIRED: ${
            authStatus.message || "A Codex CLI nincs bejelentkezve."
          }`,
        })
      }

      const translated = await translateViaCodex({
        title_hu: titleHu,
        description_hu: descriptionHu,
        translate_title: translateTitle,
        translate_description: translateDescription,
        model,
      })

      if (!translated.ok) {
        return sendJson(res, translated.statusCode, {
          message: translated.message,
        })
      }

      return sendJson(res, 200, {
        title_sk: translated.title_sk,
        description_sk: translated.description_sk,
      })
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length
          ? error.message
          : "Érvénytelen kérés a fordító oldalszolgáltatáshoz."

      return sendJson(res, 400, { message })
    }
  }

  return sendJson(res, 404, {
    message: "Not found",
  })
})

server.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`codex-sidecar listening on :${PORT}`)
})
