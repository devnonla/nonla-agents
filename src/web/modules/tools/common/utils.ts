import { slugify } from "src/common/utils/slug";
import type { Param } from "./constants";

// ─── String Helpers ───────────────────────────────────────────────────────────

export function toSnakeCase(text: string): string {
  return slugify(text, "_");
}

// ─── Param ↔ JSON Schema (legacy, UI-table based) ────────────────────────────

export function buildJsonSchema(params: Param[]) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of params) {
    if (!p.name.trim()) continue;
    properties[p.name] = {
      type: p.type,
      description: p.description || undefined,
      ...(p.type === "array" ? { items: { type: "string" } } : {}),
      ...(p.type === "object" ? { additionalProperties: true } : {}),
    };
    if (p.required) required.push(p.name);
  }
  return { type: "object", properties, required };
}

export function parseParams(tool: { parameters: unknown }): Param[] {
  const schema = tool.parameters as {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
  return Object.entries(schema?.properties ?? {}).map(([n, d]) => ({
    id: crypto.randomUUID(),
    name: n,
    type: (d.type ?? "string") as Param["type"],
    description: d.description ?? "",
    required: (schema?.required ?? []).includes(n),
  }));
}

export function buildTestInput(params: Param[]) {
  const obj: Record<string, unknown> = {};
  for (const p of params) {
    if (!p.name.trim()) continue;
    obj[p.name] = p.type === "string" ? "example" : p.type === "number" ? 0 : p.type === "boolean" ? true : ["item"];
  }
  return JSON.stringify(obj, null, 2);
}

// ─── JSDoc-based Param Annotations ───────────────────────────────────────────

interface RawAnnotation {
  rawType: string;
  name: string;
  required: boolean;
  description: string;
}

// Matches: @param {type} name (required|optional) - description
// Type can be: string, number, object[], enum:a|b|c, etc.
const ANNOTATION_REGEX = /@param\s+\{([^}]+)\}\s+([\w.\[\]]+)(?:\s+\((required|optional)\))?(?:\s+-\s+(.+))?/g;

/** Parse enum values from type string like "enum:goto|click|type" → ["goto","click","type"] */
function parseEnumValues(rawType: string): string[] {
  const colonIdx = rawType.indexOf(":");
  if (colonIdx === -1) return [];
  return rawType
    .slice(colonIdx + 1)
    .split("|")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseAnnotations(code: string): RawAnnotation[] {
  const annotations: RawAnnotation[] = [];
  for (const match of code.matchAll(ANNOTATION_REGEX)) {
    annotations.push({
      rawType: match[1],
      name: match[2],
      required: match[3] !== "optional",
      description: match[4]?.trim() ?? "",
    });
  }
  return annotations;
}

/** Parse top-level `@param` annotations from code. Skips nested dot-notation and array-item params. */
export function parseParamsFromCode(code: string): Param[] {
  const annotations = parseAnnotations(code);
  return annotations
    .filter((a) => !a.name.includes(".") && !a.name.includes("["))
    .map((a) => ({
      id: crypto.randomUUID(),
      // `object[]` → type stays "array" (not "object"), same as `string[]`, `number[]`
      type: (a.rawType.endsWith("[]") ? "array" : a.rawType) as Param["type"],
      name: a.name,
      required: a.required,
      description: a.description,
    }));
}

/**
 * Build a rich JSON Schema from code annotations.
 * Supports primitives, typed arrays (`string[]`), and nested object props (dot-notation).
 */
export function buildJsonSchemaFromCode(code: string) {
  const annotations = parseAnnotations(code);
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const a of annotations) {
    // Skip nested props (dot-notation like `obj.field` or `arr[].field`)
    if (a.name.includes(".") || a.name.includes("[")) continue;
    const { rawType } = a;
    const desc = a.description || undefined;
    if (rawType.startsWith("enum:")) {
      const values = parseEnumValues(rawType);
      properties[a.name] = { type: "string", ...(values.length > 0 ? { enum: values } : {}), description: desc };
    } else if (rawType === "object[]") {
      // array of objects — will collect nested props below
      properties[a.name] = { type: "array", items: { type: "object", properties: {} }, description: desc };
    } else if (rawType.endsWith("[]")) {
      properties[a.name] = { type: "array", items: { type: rawType.slice(0, -2) }, description: desc };
    } else if (rawType === "object") {
      properties[a.name] = { type: "object", properties: {}, description: desc };
    } else {
      properties[a.name] = { type: rawType, description: desc };
    }
    if (a.required) required.push(a.name);
  }

  for (const a of annotations) {
    if (!a.name.includes(".") && !a.name.includes("[")) continue;

    // Detect array-item notation: `items[].field`
    const arrayItemMatch = a.name.match(/^([\w]+)\[\]\.(.+)$/);
    if (arrayItemMatch) {
      const parent = arrayItemMatch[1];
      const child = arrayItemMatch[2];
      const parentProp = properties[parent];
      if (!parentProp || parentProp.type !== "array") continue;
      const items = parentProp.items as Record<string, unknown>;
      if (items.type !== "object") continue;
      const subProps = (items.properties ?? {}) as Record<string, unknown>;
      const desc = a.description || undefined;
      const { rawType } = a;
      if (rawType.startsWith("enum:")) {
        const values = parseEnumValues(rawType);
        subProps[child] = { type: "string", ...(values.length > 0 ? { enum: values } : {}), description: desc };
      } else {
        subProps[child] = rawType.endsWith("[]") ? { type: "array", items: { type: rawType.slice(0, -2) }, description: desc } : { type: rawType, description: desc };
      }
      items.properties = subProps;
      continue;
    }

    // Plain dot-notation: `obj.field`
    const dotIdx = a.name.indexOf(".");
    const parent = a.name.slice(0, dotIdx);
    const child = a.name.slice(dotIdx + 1);
    const parentProp = properties[parent];
    if (!parentProp || parentProp.type !== "object") continue;
    const subProps = (parentProp.properties ?? {}) as Record<string, unknown>;
    const desc = a.description || undefined;
    const { rawType } = a;
    if (rawType.startsWith("enum:")) {
      const values = parseEnumValues(rawType);
      subProps[child] = { type: "string", ...(values.length > 0 ? { enum: values } : {}), description: desc };
    } else {
      subProps[child] = rawType.endsWith("[]") ? { type: "array", items: { type: rawType.slice(0, -2) }, description: desc } : { type: rawType, description: desc };
    }
    parentProp.properties = subProps;
  }

  return { type: "object" as const, properties, required };
}

/** Convert a Param[] list into a // @param comment block. */
export function paramsToJsDoc(params: Param[]): string {
  if (params.length === 0) return "";
  const lines: string[] = [];
  for (const p of params) {
    const req = p.required ? "required" : "optional";
    const desc = p.description ? ` - ${p.description}` : "";
    const typeStr = p.type === "array" ? "string[]" : p.type;
    lines.push(`// @param {${typeStr}} ${p.name} (${req})${desc}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Inject JSDoc param block into code that does not already have one. */
export function injectParamsIntoCode(code: string, params: Param[]): string {
  if (params.length === 0) return code;
  // Match any @param annotation including array types like {string[]} or {object[]}
  if (/@param\s+\{\w[\w[\]]*\}/.test(code)) return code;
  return paramsToJsDoc(params) + code;
}

// ─── @name / @description Meta Annotations ───────────────────────────────────

export interface CodeMeta {
  name?: string;
  label?: string;
  description?: string;
}

/** Parse @name and @description from code comment annotations. */
export function parseMetaFromCode(code: string): CodeMeta {
  const meta: CodeMeta = {};
  const nameMatch = code.match(/^\/\/\s*@name\s+(.+)$/m);
  if (nameMatch) meta.label = nameMatch[1].trim();
  const descMatch = code.match(/^\/\/\s*@description\s+(.+)$/m);
  if (descMatch) meta.description = descMatch[1].trim();
  // Auto-derive snake_case name from label
  if (meta.label) {
    meta.name = toSnakeCase(meta.label);
  }
  return meta;
}

/** Inject @name and @description into code if not already present. */
export function injectMetaIntoCode(code: string, meta: { label?: string; description?: string }): string {
  const lines: string[] = [];
  if (!/@name(\s|$)/m.test(code) && meta.label) {
    lines.push(`// @name ${meta.label}`);
  }
  if (!/@description(\s|$)/m.test(code) && meta.description) {
    lines.push(`// @description ${meta.description}`);
  }
  if (lines.length === 0) return code;
  return `${lines.join("\n")}\n${code}`;
}

function schemaTypeToAnnotation(prop: Record<string, unknown>): string {
  if (Array.isArray(prop.enum)) return `enum:${(prop.enum as string[]).join("|")}`;
  if (prop.type === "array") {
    const items = (prop.items ?? {}) as Record<string, unknown>;
    if (items.type === "object") return "object[]";
    if (typeof items.type === "string") return `${items.type}[]`;
    return "string[]";
  }
  if (typeof prop.type === "string") return prop.type;
  return "string";
}

function jsonSchemaToParamComments(schema: object): string {
  const s = schema as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
  const properties = s.properties ?? {};
  const required = new Set(s.required ?? []);
  const lines: string[] = [];

  for (const [name, prop] of Object.entries(properties)) {
    const req = required.has(name) ? "required" : "optional";
    const desc = typeof prop.description === "string" && prop.description ? ` - ${prop.description}` : "";
    lines.push(`// @param {${schemaTypeToAnnotation(prop)}} ${name} (${req})${desc}`);

    if (prop.type === "object" && prop.properties && typeof prop.properties === "object") {
      const nestedReq = new Set((prop.required as string[] | undefined) ?? []);
      for (const [child, childProp] of Object.entries(prop.properties as Record<string, Record<string, unknown>>)) {
        const childReq = nestedReq.has(child) ? "required" : "optional";
        const childDesc = typeof childProp.description === "string" && childProp.description ? ` - ${childProp.description}` : "";
        lines.push(`// @param {${schemaTypeToAnnotation(childProp)}} ${name}.${child} (${childReq})${childDesc}`);
      }
    }

    if (prop.type === "array") {
      const items = (prop.items ?? {}) as Record<string, unknown>;
      if (items.type === "object" && items.properties && typeof items.properties === "object") {
        const nestedReq = new Set((items.required as string[] | undefined) ?? []);
        for (const [child, childProp] of Object.entries(items.properties as Record<string, Record<string, unknown>>)) {
          const childReq = nestedReq.has(child) ? "required" : "optional";
          const childDesc = typeof childProp.description === "string" && childProp.description ? ` - ${childProp.description}` : "";
          lines.push(`// @param {${schemaTypeToAnnotation(childProp)}} ${name}[].${child} (${childReq})${childDesc}`);
        }
      }
    }
  }

  return lines.join("\n");
}

const META_LINE_RE = /^\/\/\s*@(?:name|description|param)\b/;

/** Drop leading @name / @description / @param comments so drafts can be compared by source body. */
export function stripAnnotationHeader(code: string): string {
  const lines = code.split("\n");
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === "" || META_LINE_RE.test(t)) {
      i++;
      continue;
    }
    break;
  }
  return lines.slice(i).join("\n").replace(/^\n+/, "");
}

/** True when two tool scripts are the same aside from annotation headers / trailing whitespace. */
export function sameSourceBody(a: string, b: string): boolean {
  return stripAnnotationHeader(a).trim() === stripAnnotationHeader(b).trim();
}

/** Replace leading @name / @description / @param comments with stored metadata. */
export function syncAnnotationHeader(code: string, meta: { label?: string; description?: string; parameters?: object }): string {
  if (!meta.label && !meta.description && !meta.parameters) return code;
  const body = stripAnnotationHeader(code);
  const header: string[] = [];
  if (meta.label) header.push(`// @name ${meta.label}`);
  if (meta.description) header.push(`// @description ${meta.description}`);
  if (meta.parameters) {
    const paramBlock = jsonSchemaToParamComments(meta.parameters);
    if (paramBlock) header.push(paramBlock);
  }
  if (header.length === 0) return code;
  const joined = `${header.join("\n")}\n\n${body}`;
  return joined.endsWith("\n") ? joined : `${joined}\n`;
}
