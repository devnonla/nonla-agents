import { slugify } from "../../../common/utils/slug.js";

// ─── Code Annotation Parser ──────────────────────────────────────────────────
// Parses @name, @description, and @param annotations from TypeScript tool code.
// Used server-side to auto-derive tool metadata whenever codeContent is updated.

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawAnnotation {
  rawType: string;
  name: string;
  required: boolean;
  description: string;
}

export interface CodeMeta {
  name?: string;
  label?: string;
  description?: string;
}

export const TOOL_PARAM_TYPES = ["string", "number", "boolean", "integer", "string[]", "number[]", "boolean[]", "object", "object[]", "enum"] as const;

export type ToolParamType = (typeof TOOL_PARAM_TYPES)[number];

export interface ToolParamInput {
  name: string;
  type: ToolParamType;
  description: string;
  required?: boolean;
  enum?: string[];
  properties?: ToolParamInput[];
}

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required: string[];
}

// ─── Regex ───────────────────────────────────────────────────────────────────

// Matches: @param {type} name (required|optional) - description
const ANNOTATION_REGEX = /@param\s+\{([^}]+)\}\s+([\w.\[\]]+)(?:\s+\((required|optional)\))?(?:\s+-\s+(.+))?/g;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

  // Extract only the leading comment/annotation block.
  // Stops at the first non-comment, non-blank line to handle cases
  // where @param annotations are immediately followed by code (no blank line).
  const headerLines: string[] = [];
  for (const line of code.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || isAnnotationComment(trimmed)) {
      headerLines.push(line);
    } else {
      break;
    }
  }
  const headerBlock = headerLines.join("\n");

  for (const match of headerBlock.matchAll(ANNOTATION_REGEX)) {
    annotations.push({
      rawType: match[1],
      name: match[2],
      required: match[3] !== "optional",
      description: match[4]?.trim() ?? "",
    });
  }
  return annotations;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function isAnnotationComment(trimmedLine: string): boolean {
  return trimmedLine.startsWith("//") || trimmedLine.startsWith("/*") || trimmedLine.startsWith("*") || trimmedLine.startsWith("*/");
}

/** Parse @name and @description from code comment annotations. */
export function parseMetaFromCode(code: string): CodeMeta {
  const meta: CodeMeta = {};
  const nameMatch = code.match(/^\/\/\s*@name\s+(.+)$/m);
  if (nameMatch) meta.label = nameMatch[1].trim();
  const descMatch = code.match(/^\/\/\s*@description\s+(.+)$/m);
  if (descMatch) meta.description = descMatch[1].trim();
  if (meta.label) {
    meta.name = slugify(meta.label, "_");
  }
  return meta;
}

/**
 * Build a rich JSON Schema from code @param annotations.
 * Supports primitives, typed arrays, enums, nested objects, and array-of-objects.
 */
export function buildJsonSchemaFromCode(code: string) {
  const annotations = parseAnnotations(code);
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const a of annotations) {
    if (a.name.includes(".") || a.name.includes("[")) continue;
    const { rawType } = a;
    const desc = a.description || undefined;
    if (rawType.startsWith("enum:")) {
      const values = parseEnumValues(rawType);
      properties[a.name] = { type: "string", ...(values.length > 0 ? { enum: values } : {}), description: desc };
    } else if (rawType === "object[]") {
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

  // Second pass: nested props (dot-notation and array-item notation)
  for (const a of annotations) {
    if (!a.name.includes(".") && !a.name.includes("[")) continue;

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

function collectDuplicateParamNames(params: ToolParamInput[], path = ""): string[] {
  const dupes: string[] = [];
  const seen = new Set<string>();
  for (const p of params) {
    const key = path ? `${path}.${p.name}` : p.name;
    if (seen.has(p.name)) dupes.push(key);
    seen.add(p.name);
    if (p.properties?.length) dupes.push(...collectDuplicateParamNames(p.properties, key));
  }
  return dupes;
}

export function findDuplicateParamNames(params: ToolParamInput[]): string[] {
  return collectDuplicateParamNames(params);
}

function paramToSchema(p: ToolParamInput): Record<string, unknown> {
  const description = p.description || undefined;
  if (p.type === "enum") {
    return { type: "string", ...(p.enum && p.enum.length > 0 ? { enum: p.enum } : {}), description };
  }
  if (p.type === "object") {
    const nested = paramsToJsonSchema(p.properties ?? []);
    return { type: "object", properties: nested.properties, required: nested.required, description };
  }
  if (p.type === "object[]") {
    const nested = paramsToJsonSchema(p.properties ?? []);
    return {
      type: "array",
      items: { type: "object", properties: nested.properties, required: nested.required },
      description,
    };
  }
  if (p.type.endsWith("[]")) {
    return { type: "array", items: { type: p.type.slice(0, -2) }, description };
  }
  return { type: p.type, description };
}

/** Convert the LLM-friendly param list into the JSON Schema stored on the tool. */
export function paramsToJsonSchema(params: ToolParamInput[]): JsonSchemaObject {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  for (const p of params) {
    properties[p.name] = paramToSchema(p);
    if (p.required !== false) required.push(p.name);
  }
  return { type: "object", properties, required };
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

function appendParamLines(lines: string[], name: string, prop: Record<string, unknown>, required: boolean): void {
  const req = required ? "required" : "optional";
  const desc = typeof prop.description === "string" && prop.description ? ` - ${prop.description}` : "";
  lines.push(`// @param {${schemaTypeToAnnotation(prop)}} ${name} (${req})${desc}`);
}

/** Serialize a stored JSON Schema back into `// @param` comments. */
export function jsonSchemaToParamComments(schema: object): string {
  const s = schema as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
  const properties = s.properties ?? {};
  const required = new Set(s.required ?? []);
  const lines: string[] = [];

  for (const [name, prop] of Object.entries(properties)) {
    appendParamLines(lines, name, prop, required.has(name));

    if (prop.type === "object" && prop.properties && typeof prop.properties === "object") {
      const nestedReq = new Set((prop.required as string[] | undefined) ?? []);
      for (const [child, childProp] of Object.entries(prop.properties as Record<string, Record<string, unknown>>)) {
        appendParamLines(lines, `${name}.${child}`, childProp, nestedReq.has(child));
      }
    }

    if (prop.type === "array") {
      const items = (prop.items ?? {}) as Record<string, unknown>;
      if (items.type === "object" && items.properties && typeof items.properties === "object") {
        const nestedReq = new Set((items.required as string[] | undefined) ?? []);
        for (const [child, childProp] of Object.entries(items.properties as Record<string, Record<string, unknown>>)) {
          appendParamLines(lines, `${name}[].${child}`, childProp, nestedReq.has(child));
        }
      }
    }
  }

  return lines.join("\n");
}

const META_LINE_RE = /^\/\/\s*@(?:name|description|param)\b/;

/** Drop leading @name / @description / @param comments. */
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

/** Replace leading @name / @description / @param comments with a canonical header. */
export function syncAnnotationHeader(code: string, meta: { label: string; description: string }, parameters?: object): string {
  const body = stripAnnotationHeader(code);
  const header = [`// @name ${meta.label}`, `// @description ${meta.description}`];
  const paramBlock = parameters ? jsonSchemaToParamComments(parameters) : "";
  if (paramBlock) header.push(paramBlock);
  const joined = `${header.join("\n")}\n\n${body}`;
  return joined.endsWith("\n") ? joined : `${joined}\n`;
}
