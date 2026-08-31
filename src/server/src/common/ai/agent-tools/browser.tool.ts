import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { type BrowserAction, runBrowserActions } from "./browser-runner.js";

const actionEnum = z.enum(["navigate", "click", "fill", "type", "press", "wait", "scroll", "select", "snapshot", "screenshot"]);

export const browserTool = tool(
  async ({ actions }: { actions: BrowserAction[] }) => {
    const result = await runBrowserActions(actions);
    return JSON.stringify(result);
  },
  {
    name: "browser",
    description: `Open a stealth headless browser (CloakBrowser — anti-bot / fingerprint patched Chromium), run a sequence of actions in order, then close the browser. Interactions use human-like mouse/keyboard timing.

Do NOT use for simple page/docs/API reads — prefer fetch_url (md for page content) first. Only use browser for SPA/JS-rendered pages that need interaction (click/fill/login) or a post-render snapshot.

Pass **actions** as an ordered list. Supported action types:
- **navigate** — \`{ action: "navigate", url }\`
- **click** — \`{ action: "click", selector }\`
- **fill** — clear + set input value \`{ action: "fill", selector, value }\`
- **type** — type into element \`{ action: "type", selector, text }\`
- **press** — key press \`{ action: "press", key }\` (optional selector)
- **wait** — \`{ action: "wait", ms }\` or \`{ action: "wait", selector }\`
- **scroll** — \`{ action: "scroll", direction?: "up"|"down", amount?: number, selector? }\`
- **select** — dropdown \`{ action: "select", selector, value }\`
- **snapshot** — return visible page text
- **screenshot** — save PNG under data dir, return file path

Typical flow: navigate → wait/snapshot → interact → snapshot.
Stops on first failed action. Max 30 actions per call.`,
    schema: z.object({
      actions: z
        .array(
          z.object({
            action: actionEnum.describe("Action type to perform"),
            url: z.string().optional().describe("URL for navigate"),
            selector: z.string().optional().describe("CSS selector for element actions"),
            value: z.string().optional().describe("Value for fill/select"),
            text: z.string().optional().describe("Text for type"),
            key: z.string().optional().describe("Key for press, e.g. Enter, Tab, Escape"),
            ms: z.number().optional().describe("Milliseconds for wait (max 60000)"),
            direction: z.enum(["up", "down"]).optional().describe("Scroll direction"),
            amount: z.number().optional().describe("Scroll pixels (default 800)"),
          }),
        )
        .min(1)
        .max(30)
        .describe("Ordered list of browser actions to run sequentially"),
    }),
  },
);

export const TOOL_DEF = {
  toolName: "browser",
  toolLabel: "Browser",
  description: "Open a stealth browser (CloakBrowser), run actions (navigate, click, fill, type, press, wait, scroll, select, snapshot, screenshot), then close. Prefer fetch_url (md) for simple page reads; use browser only for SPA/JS that needs interaction or post-render snapshot.",
  parameters: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        description: "Ordered list of browser actions to run sequentially",
        items: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["navigate", "click", "fill", "type", "press", "wait", "scroll", "select", "snapshot", "screenshot"],
              description: "Action type",
            },
            url: { type: "string", description: "URL for navigate" },
            selector: { type: "string", description: "CSS selector for element actions" },
            value: { type: "string", description: "Value for fill/select" },
            text: { type: "string", description: "Text for type" },
            key: { type: "string", description: "Key for press (e.g. Enter)" },
            ms: { type: "number", description: "Milliseconds for wait" },
            direction: { type: "string", enum: ["up", "down"], description: "Scroll direction" },
            amount: { type: "number", description: "Scroll pixels" },
          },
          required: ["action"],
        },
      },
    },
    required: ["actions"],
  },
};
