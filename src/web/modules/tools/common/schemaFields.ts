export const PARAM_TYPES = ["string", "number", "boolean", "integer", "string[]", "number[]", "boolean[]", "object", "object[]", "enum"] as const;

export type ParamType = (typeof PARAM_TYPES)[number];

export interface JsonSchemaProp {
  type?: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
  items?: JsonSchemaProp;
}

export interface DraftParam {
  id: string;
  name: string;
  type: ParamType;
  required: boolean;
  description: string;
  enumValues: string;
  children: DraftParam[];
}

export function emptyDraftParam(): DraftParam {
  return {
    id: crypto.randomUUID(),
    name: "",
    type: "string",
    required: true,
    description: "",
    enumValues: "",
    children: [],
  };
}

export function jsonSchemaPropType(prop: JsonSchemaProp): ParamType {
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return "enum";
  if (prop.type === "array") {
    const items = prop.items ?? {};
    if (items.type === "object") return "object[]";
    if (items.type === "string") return "string[]";
    if (items.type === "number") return "number[]";
    if (items.type === "boolean") return "boolean[]";
    return "string[]";
  }
  if (prop.type === "integer") return "integer";
  if (prop.type === "number") return "number";
  if (prop.type === "boolean") return "boolean";
  if (prop.type === "object") return "object";
  return "string";
}

function propToDraft(name: string, prop: JsonSchemaProp, required: boolean): DraftParam {
  const type = jsonSchemaPropType(prop);
  const nested = type === "object" ? jsonSchemaToDraft({ type: "object", properties: prop.properties, required: prop.required }) : type === "object[]" ? jsonSchemaToDraft({ type: "object", properties: prop.items?.properties, required: prop.items?.required }) : [];
  return {
    id: crypto.randomUUID(),
    name,
    type,
    required,
    description: prop.description ?? "",
    enumValues: Array.isArray(prop.enum) ? prop.enum.join(", ") : "",
    children: nested,
  };
}

export function jsonSchemaToDraft(schema: unknown): DraftParam[] {
  const root = (schema ?? {}) as { properties?: Record<string, JsonSchemaProp>; required?: string[] };
  const required = new Set(root.required ?? []);
  return Object.entries(root.properties ?? {}).map(([name, prop]) => propToDraft(name, prop, required.has(name)));
}

function draftToProp(p: DraftParam): Record<string, unknown> {
  const description = p.description.trim() || undefined;
  if (p.type === "enum") {
    const values = p.enumValues
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    return { type: "string", ...(values.length > 0 ? { enum: values } : {}), description };
  }
  if (p.type === "object") {
    const nested = draftToJsonSchema(p.children);
    return { type: "object", properties: nested.properties, required: nested.required, description };
  }
  if (p.type === "object[]") {
    const nested = draftToJsonSchema(p.children);
    return { type: "array", items: { type: "object", properties: nested.properties, required: nested.required }, description };
  }
  if (p.type.endsWith("[]")) {
    return { type: "array", items: { type: p.type.slice(0, -2) }, description };
  }
  return { type: p.type, description };
}

export function draftToJsonSchema(params: DraftParam[]): {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of params) {
    const name = p.name.trim();
    if (!name) continue;
    properties[name] = draftToProp(p);
    if (p.required) required.push(name);
  }
  return { type: "object", properties, required };
}

export function paramCountOf(schema: unknown): number {
  const root = (schema ?? {}) as { properties?: Record<string, unknown> };
  return Object.keys(root.properties ?? {}).length;
}
