import { describe, expect, test } from "bun:test";
import { isRaSiteFormSubmitMessage, isRaSiteNavigateMessage, resolveSiteNavigate, shouldReloadAfterAction } from "./siteFormSubmit";

describe("siteFormSubmit helpers", () => {
  test("isRaSiteFormSubmitMessage validates entries shape", () => {
    expect(isRaSiteFormSubmitMessage({ type: "ra-site-form-submit", entries: [["a", "1"]] })).toBe(true);
    expect(isRaSiteFormSubmitMessage({ type: "ra-site-form-submit", entries: [["a", "1"]], path: "/p" })).toBe(true);
    expect(isRaSiteFormSubmitMessage({ type: "ra-site-form-submit", entries: [["a", 1]] })).toBe(false);
    expect(isRaSiteFormSubmitMessage({ type: "ra-site-form-submit", entries: "x" })).toBe(false);
    expect(isRaSiteFormSubmitMessage({ type: "other", entries: [] })).toBe(false);
  });

  test("shouldReloadAfterAction defaults to true", () => {
    expect(shouldReloadAfterAction(undefined)).toBe(true);
    expect(shouldReloadAfterAction({ ok: true })).toBe(true);
    expect(shouldReloadAfterAction({ ok: false, reload: false })).toBe(false);
  });

  test("isRaSiteNavigateMessage validates href", () => {
    expect(isRaSiteNavigateMessage({ type: "ra-site-navigate", href: "?tab=speech" })).toBe(true);
    expect(isRaSiteNavigateMessage({ type: "ra-site-navigate", href: 1 })).toBe(false);
    expect(isRaSiteNavigateMessage({ type: "other", href: "/" })).toBe(false);
  });

  test("resolveSiteNavigate soft-navs same public path query links", () => {
    const origin = "https://agents.example.com";
    const path = "/public/sites/demo";
    expect(resolveSiteNavigate("?tab=speech", path, origin)).toEqual({
      kind: "soft",
      query: { tab: "speech" },
      displayPath: "/public/sites/demo?tab=speech",
    });
    expect(resolveSiteNavigate(`${path}?tab=speech`, path, origin).kind).toBe("soft");
    expect(resolveSiteNavigate(`${origin}${path}?tab=speech`, path, origin).kind).toBe("soft");
  });

  test("resolveSiteNavigate opens non-site URLs externally", () => {
    const origin = "https://agents.example.com";
    const path = "/public/sites/demo";
    expect(resolveSiteNavigate("https://example.com/x", path, origin)).toEqual({
      kind: "external",
      url: "https://example.com/x",
    });
    expect(resolveSiteNavigate(`${origin}/sites/abc?tab=speech`, path, origin).kind).toBe("external");
    expect(resolveSiteNavigate("#section", path, origin).kind).toBe("ignore");
  });
});
