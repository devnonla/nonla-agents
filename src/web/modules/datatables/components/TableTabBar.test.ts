import { describe, expect, test } from "bun:test";
import { pickVisible } from "./TableTabBar";

describe("pickVisible", () => {
  test("keeps every tab when the row is wide enough", () => {
    expect(pickVisible([80, 80, 80], 300, 32, 0)).toEqual([0, 1, 2]);
  });

  test("hides the tail and keeps the open table on the row", () => {
    expect(pickVisible([80, 80, 80, 80], 220, 32, 3)).toEqual([0, 3]);
  });
});
