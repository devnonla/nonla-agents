import { afterEach, describe, expect, test } from "bun:test";
import { _setNpmFetchForTest, runSearchNpm } from "../common/ai/agent-tools/search-npm.tool.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("runSearchNpm", () => {
  afterEach(() => {
    _setNpmFetchForTest(null);
  });

  test("rejects missing query and name", async () => {
    const result = await runSearchNpm({});
    expect(result.ok).toBe(false);
    expect(String(result.error)).toMatch(/query|name/i);
  });

  test("search returns compact package hits", async () => {
    _setNpmFetchForTest(async (url) => {
      expect(url).toContain("/-/v1/search?");
      expect(url).toContain("text=csv%20parser");
      expect(url).toContain("size=8");
      return jsonResponse({
        total: 2,
        objects: [
          {
            package: {
              name: "csv-parse",
              version: "5.6.0",
              description: "CSV parser",
              keywords: ["csv", "parse"],
              date: "2024-01-01T00:00:00.000Z",
            },
            score: { detail: { popularity: 0.8, quality: 0.9, maintenance: 0.7 } },
          },
          {
            package: { name: "papaparse", version: "5.4.1", description: "Papa Parse" },
            score: { detail: { popularity: 0.9 } },
          },
        ],
      });
    });

    const result = await runSearchNpm({ query: "csv parser" });
    expect(result.ok).toBe(true);
    expect(result.total).toBe(2);
    const packages = result.packages as Record<string, unknown>[];
    expect(packages).toHaveLength(2);
    expect(packages[0]).toMatchObject({
      name: "csv-parse",
      version: "5.6.0",
      description: "CSV parser",
      popularity: 0.8,
    });
    expect(packages[1]?.name).toBe("papaparse");
  });

  test("name returns slim package details and clips readme", async () => {
    const longReadme = "A".repeat(2_500);
    _setNpmFetchForTest(async (url) => {
      expect(url).toBe("https://registry.npmjs.org/cheerio");
      return jsonResponse({
        name: "cheerio",
        description: "Tiny HTML parser",
        readme: longReadme,
        "dist-tags": { latest: "1.0.0" },
        versions: {
          "1.0.0": {
            description: "Tiny HTML parser",
            license: "MIT",
            homepage: "https://cheerio.js.org/",
            repository: { type: "git", url: "git+https://github.com/cheeriojs/cheerio.git" },
            keywords: ["html", "parser"],
          },
        },
      });
    });

    const result = await runSearchNpm({ name: "cheerio" });
    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      name: "cheerio",
      version: "1.0.0",
      license: "MIT",
      homepage: "https://cheerio.js.org/",
      readmeTruncated: true,
    });
    expect(String(result.readme).length).toBeLessThan(2_500);
    expect(String(result.readme)).toContain("[truncated]");
  });

  test("rejects invalid package name", async () => {
    const result = await runSearchNpm({ name: "../evil" });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toMatch(/invalid/i);
  });

  test("package 404", async () => {
    _setNpmFetchForTest(async () => jsonResponse({ error: "Not found" }, 404));
    const result = await runSearchNpm({ name: "this-package-does-not-exist-xyz" });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toMatch(/not found/i);
  });
});
