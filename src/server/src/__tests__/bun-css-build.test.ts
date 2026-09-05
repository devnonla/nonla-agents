import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpDir } from "../common/utils/data-dir.js";

describe("Bun.build CSS from import", () => {
  const dir = join(tmpDir(), `nonla-bun-css-${crypto.randomUUID()}`);

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('import "./styles.css" emits a CSS output alongside JS', async () => {
    mkdirSync(dir, { recursive: true });
    await Bun.write(join(dir, "styles.css"), ".hero { color: #b91c1c; }\n");
    await Bun.write(join(dir, "entry.tsx"), 'import "./styles.css";\nexport const ok = true;\n');

    const result = await Bun.build({
      entrypoints: [join(dir, "entry.tsx")],
      outdir: dir,
      target: "browser",
      format: "esm",
      minify: true,
      sourcemap: "none",
      naming: "[name].[ext]",
    });

    expect(result.success).toBe(true);
    const cssOutputs = result.outputs.filter((o) => o.path.endsWith(".css"));
    expect(cssOutputs.length).toBeGreaterThan(0);
    const css = (await cssOutputs[0].text()).replace(/\s+/g, " ");
    expect(css).toContain(".hero");
    expect(css).toContain("#b91c1c");
  });
});
