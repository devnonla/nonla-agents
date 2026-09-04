import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { type SkillStreamRequest, streamSkillAgent } from "./services/skill-agent.service.js";
import { createReference, createSkill, deleteReference, deleteSkill, getReference, getSkill, listReferences, listSkills, updateReference, updateSkill } from "./skills.service.js";

const app = new Hono();

app.get("/", async (c) => c.json(await listSkills(c.req.query())));

app.post("/:id/assistant/stream", async (c) => {
  const skillId = c.req.param("id");
  const body = await c.req.json<SkillStreamRequest>();

  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => {
      abort.abort();
    });
    await streamSkillAgent(skillId, body, stream, abort.signal);
  });
});

app.get("/:id", async (c) => {
  const row = await getSkill(c.req.param("id"));
  if (!row) throw new BadRequestException("Skill not found");
  return c.json(row);
});

app.post("/", async (c) => {
  const body = await c.req.json();
  return c.json(await createSkill(body), 201);
});

app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(await updateSkill(c.req.param("id"), body));
});

app.delete("/:id", async (c) => {
  await deleteSkill(c.req.param("id"));
  return c.json({ ok: true });
});

app.get("/:id/references", async (c) => c.json(await listReferences(c.req.param("id"))));

app.post("/:id/references", async (c) => {
  const body = await c.req.json();
  return c.json(await createReference(c.req.param("id"), body), 201);
});

app.put("/:id/references/:refId", async (c) => {
  const body = await c.req.json();
  return c.json(await updateReference(c.req.param("id"), c.req.param("refId"), body));
});

app.delete("/:id/references/:refId", async (c) => {
  await deleteReference(c.req.param("id"), c.req.param("refId"));
  return c.json({ ok: true });
});

app.get("/:id/references/:refId", async (c) => {
  const row = await getReference(c.req.param("id"), c.req.param("refId"));
  if (!row) throw new BadRequestException("Reference not found");
  return c.json(row);
});

export default app;
