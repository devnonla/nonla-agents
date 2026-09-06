import { describe, expect, test } from "bun:test";
import { detectPackages, packageNameFromSpecifier } from "../common/sandbox/detect-packages.js";

describe("packageNameFromSpecifier", () => {
  test("returns the npm name for bare and scoped specifiers", () => {
    expect(packageNameFromSpecifier("nanoid")).toBe("nanoid");
    expect(packageNameFromSpecifier("motion/react")).toBe("motion");
    expect(packageNameFromSpecifier("@radix-ui/react-dialog")).toBe("@radix-ui/react-dialog");
    expect(packageNameFromSpecifier("react/jsx-runtime")).toBe("react");
  });

  test("ignores relative, builtin, and platform modules", () => {
    expect(packageNameFromSpecifier("./site-api.js")).toBeNull();
    expect(packageNameFromSpecifier("../foo")).toBeNull();
    expect(packageNameFromSpecifier("node:fs")).toBeNull();
    expect(packageNameFromSpecifier("fs")).toBeNull();
    expect(packageNameFromSpecifier("bun:sqlite")).toBeNull();
    expect(packageNameFromSpecifier("nonlaagents")).toBeNull();
    expect(packageNameFromSpecifier("@nonla-agents/runtime")).toBeNull();
  });
});

describe("detectPackages", () => {
  test("collects import specifiers", () => {
    const code = `
import { useState } from "react";
import { nanoid } from "nanoid";
import { motion } from "motion/react";
import { loadSiteData } from "./site-api.js";
const fs = await import("node:fs");
`;
    expect(detectPackages(code).sort()).toEqual(["motion", "nanoid", "react"]);
  });

  test("honors // bun: overrides when the npm name differs", () => {
    const code = `import x from "sharp" // bun: sharp
import y from "foo"`;
    const pkgs = detectPackages(code);
    expect(pkgs).toContain("sharp");
    expect(pkgs).toContain("foo");
  });
});
