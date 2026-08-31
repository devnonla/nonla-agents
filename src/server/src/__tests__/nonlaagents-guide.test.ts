import { describe, expect, test } from "bun:test";
import { buildNonlaagentsGuide, makeNonlaagentsGuideTool } from "../common/ai/agent-tools/nonlaagents-guide.tool.js";
import { buildJobCodingSystemPrompt } from "../modules/jobs/common/job-agent-prompt.js";

describe("buildNonlaagentsGuide", () => {
  test("tools flavor returns kv/secrets/datatable and omits job-only APIs", () => {
    const guide = buildNonlaagentsGuide("tools");
    expect(guide).toContain("nonlaagents.kv");
    expect(guide).toContain("nonlaagents.secrets");
    expect(guide).toContain("nonlaagents.datatable");
    expect(guide).not.toContain("nonlaagents.agents");
    expect(guide).not.toContain("nonlaagents.step");
  });

  test("topic=kv returns only the kv section", () => {
    const guide = buildNonlaagentsGuide("tools", "kv");
    expect(guide).toContain("nonlaagents.kv");
    expect(guide).not.toContain("nonlaagents.datatable");
    expect(guide).not.toContain("nonlaagents.secrets");
  });

  test("jobs flavor includes agents and activity", () => {
    const guide = buildNonlaagentsGuide("jobs", "agents");
    expect(guide).toContain("nonlaagents.agents");
    expect(guide).not.toContain("nonlaagents.datatable");
  });

  test("unknown topic lists allowed values", () => {
    const guide = buildNonlaagentsGuide("tools", "agents");
    expect(guide).toMatch(/Unknown topic/);
    expect(guide).toContain("kv");
    expect(guide).toContain("datatable");
  });
});

describe("makeNonlaagentsGuideTool", () => {
  test("invoke returns the tools SDK", async () => {
    const t = makeNonlaagentsGuideTool("tools");
    const result = await t.invoke({ topic: "secrets" });
    expect(String(result)).toContain("nonlaagents.secrets");
    expect(String(result)).not.toContain("nonlaagents.kv.get");
  });
});

describe("coding prompts stay lean", () => {
  test("job prompt does not inline datatable query syntax", () => {
    const prompt = buildJobCodingSystemPrompt(null, undefined);
    expect(prompt).toContain("get_nonlaagents_guide");
    expect(prompt).not.toContain("await nonlaagents.datatable.query(");
    expect(prompt).toContain("nonlaagents.step");
  });
});
