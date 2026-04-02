import {
  DEFAULT_CODEX_SIDECAR_URL,
  DEFAULT_CODEX_TRANSLATE_MODEL,
  getAiAgentAuthStatus,
  getAiAgentStatus,
  startAiAgentAuth,
  translateHuToSk,
} from "../ai-agent"

describe("ai-agent codex sidecar integration", () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch

  afterEach(() => {
    process.env = { ...originalEnv }
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  const mockJsonResponse = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    })

  it("returns current SK values when there is nothing to translate", async () => {
    const fetchSpy = jest.spyOn(global, "fetch")

    const result = await translateHuToSk({
      title_hu: "HU title",
      description_hu: "HU description",
      title_sk: "existing SK title",
      description_sk: "existing SK description",
      overwrite: false,
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result).toEqual({
      title_sk: "existing SK title",
      description_sk: "existing SK description",
      translated_fields: [],
      skipped_fields: ["title_sk", "description_sk"],
      model: DEFAULT_CODEX_TRANSLATE_MODEL,
    })
  })

  it("calls sidecar and returns translated fields", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        mockJsonResponse({
          title_sk: "SK cím",
          description_sk: "SK leírás",
        })
      )

    const result = await translateHuToSk({
      title_hu: "HU cím",
      description_hu: "HU leírás",
      overwrite: true,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith(
      `${DEFAULT_CODEX_SIDECAR_URL}/translate`,
      expect.objectContaining({
        method: "POST",
      })
    )

    expect(result).toEqual({
      title_sk: "SK cím",
      description_sk: "SK leírás",
      translated_fields: ["title_sk", "description_sk"],
      skipped_fields: [],
      model: DEFAULT_CODEX_TRANSLATE_MODEL,
    })
  })

  it("throws auth-required error when sidecar returns 401", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      mockJsonResponse(
        {
          message: "CODEX_AUTH_REQUIRED: login required",
        },
        401
      )
    )

    await expect(
      translateHuToSk({
        title_hu: "HU cím",
        overwrite: true,
      })
    ).rejects.toThrow("CODEX_AUTH_REQUIRED")
  })

  it("returns connected status when sidecar health is green", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      mockJsonResponse({
        status: {
          connected: true,
          model: "gpt-5.3-codex",
          message: "Logged in using ChatGPT",
        },
      })
    )

    const status = await getAiAgentStatus()

    expect(status).toEqual({
      provider: "codex-cli",
      model: "gpt-5.3-codex",
      connected: true,
      sidecar_url: DEFAULT_CODEX_SIDECAR_URL,
      remediation_command:
        "docker compose exec codex-sidecar codex login --device-auth",
      message: "Logged in using ChatGPT",
    })
  })

  it("returns disconnected status when sidecar is unreachable", async () => {
    jest.spyOn(global, "fetch").mockRejectedValueOnce(new Error("connect ECONNREFUSED"))

    const status = await getAiAgentStatus()

    expect(status.provider).toBe("codex-cli")
    expect(status.connected).toBe(false)
    expect(status.model).toBe(DEFAULT_CODEX_TRANSLATE_MODEL)
    expect(status.sidecar_url).toBe(DEFAULT_CODEX_SIDECAR_URL)
    expect(status.message).toContain("nem elérhető")
  })

  it("starts auth flow and returns pending status", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      mockJsonResponse({
        status: {
          state: "pending",
          connected: false,
          verification_url: "https://auth.openai.com/codex/device",
          user_code: "ABCD-1234",
          message: "Nyisd meg a linket és add meg a kódot.",
        },
      })
    )

    const status = await startAiAgentAuth()

    expect(status.state).toBe("pending")
    expect(status.connected).toBe(false)
    expect(status.verification_url).toBe("https://auth.openai.com/codex/device")
    expect(status.user_code).toBe("ABCD-1234")
  })

  it("returns failed auth status when sidecar is unreachable", async () => {
    jest.spyOn(global, "fetch").mockRejectedValueOnce(new Error("connect ECONNREFUSED"))

    const status = await getAiAgentAuthStatus()

    expect(status.provider).toBe("codex-cli")
    expect(status.state).toBe("failed")
    expect(status.connected).toBe(false)
    expect(status.sidecar_url).toBe(DEFAULT_CODEX_SIDECAR_URL)
    expect(status.message).toContain("nem elérhető")
  })
})
