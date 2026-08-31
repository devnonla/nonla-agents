import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { launch } from "cloakbrowser";
import type { Browser, Page } from "playwright-core";
import { getDataDir } from "../../utils/data-dir.js";

export type BrowserActionType = "navigate" | "click" | "fill" | "type" | "press" | "wait" | "scroll" | "select" | "snapshot" | "screenshot";

export interface BrowserAction {
  action: BrowserActionType;
  url?: string;
  selector?: string;
  value?: string;
  text?: string;
  key?: string;
  ms?: number;
  direction?: "up" | "down";
  amount?: number;
}

export interface BrowserActionResult {
  index: number;
  action: BrowserActionType;
  ok: boolean;
  error?: string;
  content?: string;
  path?: string;
  url?: string;
}

export interface BrowserRunResult {
  ok: boolean;
  url: string;
  title: string;
  results: BrowserActionResult[];
  error?: string;
}

const MAX_ACTIONS = 30;
const DEFAULT_TIMEOUT_MS = 30_000;
/** Chromium launch can hang on missing deps / sandbox — fail fast instead of freezing the whole agent stream. */
const LAUNCH_TIMEOUT_MS = 45_000;
const MAX_SNAPSHOT_CHARS = 40_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function requireSelector(action: BrowserAction, index: number): string {
  if (!action.selector?.trim()) {
    throw new Error(`Action[${index}] "${action.action}" requires selector`);
  }
  return action.selector;
}

async function takeSnapshot(page: Page): Promise<string> {
  const text = await page.evaluate(() => {
    const body = document.body;
    if (!body) return "";
    return body.innerText.replace(/\n{3,}/g, "\n\n").trim();
  });
  if (text.length <= MAX_SNAPSHOT_CHARS) return text;
  return `${text.slice(0, MAX_SNAPSHOT_CHARS)}\n\n…[truncated ${text.length - MAX_SNAPSHOT_CHARS} chars]`;
}

async function runOneAction(page: Page, action: BrowserAction, index: number): Promise<BrowserActionResult> {
  const base: BrowserActionResult = { index, action: action.action, ok: true };

  switch (action.action) {
    case "navigate": {
      if (!action.url?.trim()) throw new Error(`Action[${index}] "navigate" requires url`);
      await page.goto(action.url, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT_MS });
      return { ...base, url: page.url() };
    }
    case "click": {
      await page.click(requireSelector(action, index), { timeout: DEFAULT_TIMEOUT_MS });
      return base;
    }
    case "fill": {
      if (action.value === undefined) throw new Error(`Action[${index}] "fill" requires value`);
      await page.fill(requireSelector(action, index), action.value, { timeout: DEFAULT_TIMEOUT_MS });
      return base;
    }
    case "type": {
      const text = action.text ?? action.value;
      if (text === undefined) throw new Error(`Action[${index}] "type" requires text`);
      await page.type(requireSelector(action, index), text, { timeout: DEFAULT_TIMEOUT_MS });
      return base;
    }
    case "press": {
      if (!action.key?.trim()) throw new Error(`Action[${index}] "press" requires key`);
      if (action.selector?.trim()) {
        await page.press(action.selector, action.key, { timeout: DEFAULT_TIMEOUT_MS });
      } else {
        await page.keyboard.press(action.key);
      }
      return base;
    }
    case "wait": {
      if (action.selector?.trim()) {
        await page.waitForSelector(action.selector, { timeout: action.ms ?? DEFAULT_TIMEOUT_MS });
      } else {
        const ms = action.ms ?? 1000;
        if (ms < 0 || ms > 60_000) throw new Error(`Action[${index}] "wait" ms must be 0–60000`);
        await new Promise((r) => setTimeout(r, ms));
      }
      return base;
    }
    case "scroll": {
      const amount = action.amount ?? 800;
      const delta = (action.direction ?? "down") === "up" ? -amount : amount;
      if (action.selector?.trim()) {
        await page.locator(action.selector).evaluate((el, y) => el.scrollBy(0, y), delta);
      } else {
        await page.evaluate((y) => window.scrollBy(0, y), delta);
      }
      return base;
    }
    case "select": {
      if (action.value === undefined) throw new Error(`Action[${index}] "select" requires value`);
      await page.selectOption(requireSelector(action, index), action.value, { timeout: DEFAULT_TIMEOUT_MS });
      return base;
    }
    case "snapshot": {
      const content = await takeSnapshot(page);
      return { ...base, content, url: page.url() };
    }
    case "screenshot": {
      const dir = join(getDataDir(), "browser-screenshots");
      await mkdir(dir, { recursive: true });
      const filePath = join(dir, `${crypto.randomUUID()}.png`);
      await page.screenshot({ path: filePath, fullPage: false });
      return { ...base, path: filePath, url: page.url() };
    }
    default: {
      const _exhaustive: never = action.action;
      throw new Error(`Unknown action: ${_exhaustive}`);
    }
  }
}

/** Launch Chromium, run actions in order, always close the browser. */
export async function runBrowserActions(actions: BrowserAction[]): Promise<BrowserRunResult> {
  if (!Array.isArray(actions) || actions.length === 0) {
    return { ok: false, url: "", title: "", results: [], error: "actions must be a non-empty array" };
  }
  if (actions.length > MAX_ACTIONS) {
    return {
      ok: false,
      url: "",
      title: "",
      results: [],
      error: `Too many actions (max ${MAX_ACTIONS})`,
    };
  }

  let browser: Browser | null = null;
  const results: BrowserActionResult[] = [];

  try {
    browser = await withTimeout(
      launch({
        headless: true,
        humanize: true,
      }),
      LAUNCH_TIMEOUT_MS,
      "Browser launch",
    );
    const page = await browser.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

    for (let i = 0; i < actions.length; i++) {
      try {
        results.push(await runOneAction(page, actions[i], i));
      } catch (err) {
        results.push({
          index: i,
          action: actions[i].action,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          ok: false,
          url: page.url(),
          title: await page.title().catch(() => ""),
          results,
          error: `Stopped at action[${i}] "${actions[i].action}"`,
        };
      }
    }

    return {
      ok: true,
      url: page.url(),
      title: await page.title().catch(() => ""),
      results,
    };
  } catch (err) {
    return {
      ok: false,
      url: "",
      title: "",
      results,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
