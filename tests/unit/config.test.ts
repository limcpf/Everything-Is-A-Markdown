import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "../../src/config";

describe("CLI parsing", () => {
  test("parses the command and every value-bearing option", () => {
    expect(
      parseCliArgs([
        "dev",
        "--vault",
        "./vault",
        "--out",
        "./site",
        "--exclude",
        "drafts/**",
        "--exclude",
        "private/**",
        "--new-within-days",
        "0",
        "--recent-limit",
        "10",
        "--menu-config",
        "./menu.json",
        "--port",
        "4173",
      ]),
    ).toEqual({
      command: "dev",
      exclude: ["drafts/**", "private/**"],
      help: false,
      menuConfigPath: "./menu.json",
      newWithinDays: 0,
      outDir: "./site",
      port: 4173,
      recentLimit: 10,
      vaultDir: "./vault",
    });
  });

  test("defaults to build when the first token is an option", () => {
    expect(parseCliArgs(["--vault", "./notes"])).toMatchObject({
      command: "build",
      vaultDir: "./notes",
    });
  });

  for (const option of [
    "--vault",
    "--out",
    "--exclude",
    "--new-within-days",
    "--recent-limit",
    "--menu-config",
    "--port",
  ]) {
    test(`rejects a missing ${option} value`, () => {
      expect(() => parseCliArgs(["build", option])).toThrow(`[cli] Missing value for ${option}`);
    });
  }

  test("rejects unknown options at the parsing boundary", () => {
    expect(() => parseCliArgs(["build", "--unknown"])).toThrow("Unknown option: --unknown");
  });
});
