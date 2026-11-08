import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildUnsubscribeUrls,
  createUnsubscribeToken,
  unsubscribeHeaders,
  verifyUnsubscribeToken,
} from "./unsubscribe";

const userId = "8f6b6f1e-1d2c-4a7b-9c55-1f2e3d4c5b6a";

describe("unsubscribe tokens", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only the token generated for the same user and secret", () => {
    const token = createUnsubscribeToken(userId, "segredo");
    expect(verifyUnsubscribeToken(userId, token, "segredo")).toBe(true);
    expect(verifyUnsubscribeToken(userId, token, "outro")).toBe(false);
    expect(verifyUnsubscribeToken("outro-usuario", token, "segredo")).toBe(false);
    expect(verifyUnsubscribeToken(userId, `${token}x`, "segredo")).toBe(false);
    expect(verifyUnsubscribeToken(userId, "", "segredo")).toBe(false);
  });

  it("builds page and one-click URLs and the email headers", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.exemplo.com/");
    vi.stubEnv("UNSUBSCRIBE_SECRET", "segredo");
    const urls = buildUnsubscribeUrls(userId)!;
    expect(urls.page).toMatch(/^https:\/\/app\.exemplo\.com\/descadastro\?u=/);
    expect(urls.oneClick).toMatch(/^https:\/\/app\.exemplo\.com\/api\/descadastro\?u=/);
    const token = new URL(urls.page).searchParams.get("t")!;
    expect(verifyUnsubscribeToken(userId, token)).toBe(true);
    expect(unsubscribeHeaders(urls)).toEqual({
      "List-Unsubscribe": `<${urls.oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("returns null without app URL or secret", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("UNSUBSCRIBE_SECRET", "segredo");
    expect(buildUnsubscribeUrls(userId)).toBeNull();
    expect(unsubscribeHeaders(null)).toEqual({});
  });
});
