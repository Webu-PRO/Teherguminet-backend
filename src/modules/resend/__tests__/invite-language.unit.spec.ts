import { resolveInviteLanguage } from "../invite-language";

describe("resolveInviteLanguage", () => {
  it("resolves Slovak from explicit language hints", () => {
    expect(resolveInviteLanguage({ language: "sk" })).toBe("sk");
    expect(resolveInviteLanguage({ locale: "sk-SK" })).toBe("sk");
    expect(resolveInviteLanguage({ lang: "slovak" })).toBe("sk");
  });

  it("resolves Slovak from metadata hints", () => {
    expect(
      resolveInviteLanguage({
        metadata: { locale: "sk-SK" },
      })
    ).toBe("sk");
  });

  it("falls back to .sk email domain when no explicit hints exist", () => {
    expect(resolveInviteLanguage({ email: "partner@company.sk" })).toBe("sk");
  });

  it("defaults to Hungarian when hints are missing", () => {
    expect(resolveInviteLanguage({ email: "partner@example.com" })).toBe("hu");
    expect(resolveInviteLanguage()).toBe("hu");
  });

  it("prefers explicit hints over email-domain fallback", () => {
    expect(
      resolveInviteLanguage({
        email: "partner@company.sk",
        language: "hu",
      })
    ).toBe("hu");
  });
});
