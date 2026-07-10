import type { Page } from "playwright";
import { describe, expect, it } from "vitest";
import {
  isChallengePage,
  isNonCfBlockPage,
  isSolverWaitPage,
} from "../src/challenge.js";

function mockPage(html: string): Page {
  return {
    content: async () => html,
  } as Page;
}

describe("challenge page detection", () => {
  it("detects Cloudflare challenge markers", async () => {
    const page = mockPage(
      "<html><body>Just a moment... cf-challenge-running</body></html>",
    );
    expect(await isChallengePage(page)).toBe(true);
    expect(await isSolverWaitPage(page)).toBe(true);
  });

  it("detects Glints firewall as a non-CF block", async () => {
    const page = mockPage(
      "<!doctype html><title>Glints - Firewall</title><body>blocked</body>",
    );
    expect(await isChallengePage(page)).toBe(false);
    expect(await isNonCfBlockPage(page)).toBe(true);
    expect(await isSolverWaitPage(page)).toBe(true);
  });

  it("treats a normal Glints explore page as clear", async () => {
    const page = mockPage(
      "<html><title>Explore Jobs | Glints</title><body>Software Engineer</body></html>",
    );
    expect(await isChallengePage(page)).toBe(false);
    expect(await isNonCfBlockPage(page)).toBe(false);
    expect(await isSolverWaitPage(page)).toBe(false);
  });
});
