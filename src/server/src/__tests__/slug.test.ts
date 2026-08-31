import { describe, expect, test } from "bun:test";
import { slugify, stripDiacritics } from "../common/utils/slug.js";
import { parseMetaFromCode, stripAnnotationHeader } from "../modules/tools/common/code-annotations.js";
import { buildCodingSystemPrompt } from "../modules/tools/common/constants.js";

describe("slugify", () => {
  test("strips Vietnamese diacritics instead of dropping letters", () => {
    expect(slugify("Công cụ tin tức")).toBe("cong-cu-tin-tuc");
    expect(slugify("Đặng Thị Ước")).toBe("dang-thi-uoc");
    expect(slugify("Hồ Chí Minh")).toBe("ho-chi-minh");
  });

  test("maps đ/Đ and remaining Latin letters", () => {
    expect(stripDiacritics("Đà Nẵng")).toBe("Da Nang");
    expect(slugify("Café résumé")).toBe("cafe-resume");
  });

  test("supports snake_case separator for tool names", () => {
    expect(slugify("Công cụ tìm kiếm", "_")).toBe("cong_cu_tim_kiem");
  });

  test("handles NFD combining marks", () => {
    const nfd = "Công cụ".normalize("NFD");
    expect(slugify(nfd)).toBe("cong-cu");
  });
});

describe("parseMetaFromCode", () => {
  test("derives snake_case tool name from Vietnamese @name", () => {
    const meta = parseMetaFromCode("// @name Công cụ tìm kiếm\n// @description Search\nexport default async function main() { return {}; }");
    expect(meta.label).toBe("Công cụ tìm kiếm");
    expect(meta.name).toBe("cong_cu_tim_kiem");
  });
});

describe("stripAnnotationHeader", () => {
  test("drops @name/@description/@param so only the module body remains", () => {
    const code = "// @name Wiki\n// @description Search Wikipedia\n// @param {string} query (required) - Search query\n\nexport default async function main() {\n  return {};\n}\n";
    expect(stripAnnotationHeader(code)).toBe("export default async function main() {\n  return {};\n}\n");
  });
});

describe("buildCodingSystemPrompt", () => {
  test("includes current tool identity and the editor file as-is", () => {
    const prompt = buildCodingSystemPrompt("// @name Wiki\n// @description Search Wikipedia\n\nexport default async function main() {\n  return { ok: true };\n}\n", { label: "Wiki", description: "Search Wikipedia", parameters: { type: "object", properties: {} } });
    expect(prompt).toContain("<name>Wiki</name>");
    expect(prompt).toContain("<description>Search Wikipedia</description>");
    const block = prompt.match(/<current_code>\n([\s\S]*?)\n<\/current_code>/)?.[1] ?? "";
    expect(block).toContain("export default async function main");
    expect(block).toContain("@name Wiki");
  });

  test("points at get_nonlaagents_guide instead of inlining the SDK", () => {
    const prompt = buildCodingSystemPrompt("", null);
    expect(prompt).toContain("get_nonlaagents_guide");
    expect(prompt).not.toContain("await nonlaagents.datatable.query(");
    expect(prompt).not.toContain("$contains");
  });
});
