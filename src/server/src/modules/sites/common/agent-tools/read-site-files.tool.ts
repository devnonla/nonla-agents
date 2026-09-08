import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { SITE_SOURCE_FILES, type SiteSourceFile, type SiteTree, readAllSourceFiles, readSourceFile } from "../../sites-fs.js";

export function makeReadSiteFilesTool(siteId: string) {
  return tool(
    async (input) => {
      const tree = (input.tree ?? "draft") as SiteTree;
      try {
        if (input.file) {
          const file = input.file as SiteSourceFile;
          return JSON.stringify({ ok: true, tree, file, content: readSourceFile(siteId, tree, file) });
        }
        return JSON.stringify({ ok: true, tree, files: readAllSourceFiles(siteId, tree) });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
    {
      name: "read_site_files",
      description: 'Read site source (app.tsx, styles.css, backend.ts). Draft is already in the system prompt — call this only if replace failed, you need tree="prod", or a file is missing from the prompt. tree defaults to "draft". npm packages auto-install from imports — do not edit package.json.',
      schema: z.object({
        tree: z.enum(["draft", "prod"]).optional(),
        file: z.enum(SITE_SOURCE_FILES as unknown as [string, ...string[]]).optional(),
      }),
    },
  );
}
