/**
 * get-current-time.tool.ts — Builtin tool: returns current date/time in configured timezone
 *
 * LangGraph JS version — uses @langchain/core/tools
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getConfiguredTimezone } from "../../../../common/utils/cronHelper.js";

export const getCurrentTimeTool = tool(
  async () => {
    const tz = getConfiguredTimezone();
    const now = new Date().toLocaleString("en-US", {
      timeZone: tz,
      dateStyle: "full",
      timeStyle: "long",
    });
    return JSON.stringify({
      time: now,
      timezone: tz,
      iso: new Date().toISOString(),
    });
  },
  {
    name: "get_current_time",
    description: "Returns the current date and time in the configured timezone.",
    schema: z.object({}),
  },
);

export const TOOL_DEF = {
  toolName: "get_current_time",
  toolLabel: "Get Current Time",
  description: "Returns the current date and time in the specified timezone (default: UTC).",
  parameters: { type: "object", properties: {}, required: [] },
};
