import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeSeoConfig } from "./seo";
import type { BuildOptions, PinnedMenuOption, UserConfig } from "./types";

export interface CliArgs {
  command: "build" | "dev" | "clean";
  vaultDir?: string;
  outDir?: string;
  exclude: string[];
  newWithinDays?: number;
  recentLimit?: number;
  menuConfigPath?: string;
  port?: number;
  help: boolean;
}

const DEFAULTS = {
  vaultDir: ".",
  outDir: "dist",
  exclude: [".obsidian/**"],
  newWithinDays: 7,
  recentLimit: 5,
  wikilinks: true,
  imagePolicy: "omit-local" as const,
  gfm: true,
  shikiTheme: "github-dark",
};

export function parseCliArgs(argv: string[]): CliArgs {
  const [first] = argv;
  const command = first === "build" || first === "dev" || first === "clean" ? first : "build";
  const rest = first === command ? argv.slice(1) : argv;

  const parsed: CliArgs = {
    command,
    exclude: [],
    help: false,
  };

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }
    if (token === "--vault") {
      parsed.vaultDir = rest[++i];
      continue;
    }
    if (token === "--out") {
      parsed.outDir = rest[++i];
      continue;
    }
    if (token === "--exclude") {
      parsed.exclude.push(rest[++i]);
      continue;
    }
    if (token === "--new-within-days") {
      parsed.newWithinDays = Number(rest[++i]);
      continue;
    }
    if (token === "--recent-limit") {
      parsed.recentLimit = Number(rest[++i]);
      continue;
    }
    if (token === "--menu-config") {
      parsed.menuConfigPath = rest[++i];
      continue;
    }
    if (token === "--port") {
      parsed.port = Number(rest[++i]);
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return parsed;
}

export async function loadUserConfig(cwd = process.cwd()): Promise<UserConfig> {
  const candidates = ["blog.config.ts", "blog.config.js", "blog.config.mjs", "blog.config.cjs"];

  for (const fileName of candidates) {
    const absolute = path.join(cwd, fileName);
    const file = Bun.file(absolute);
    if (!(await file.exists())) {
      continue;
    }

    const imported = await import(pathToFileURL(absolute).href);
    const config = (imported.default ?? imported) as UserConfig;
    return config ?? {};
  }

  return {};
}

function normalizePinnedMenu(raw: unknown, errorPrefix = "[config]"): PinnedMenuOption | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw !== "object") {
    throw new Error(`${errorPrefix} "pinnedMenu" must be an object`);
  }

  const menu = raw as Record<string, unknown>;
  const sourceDirRaw = menu.sourceDir;
  const labelRaw = menu.label;

  if (typeof sourceDirRaw !== "string" || sourceDirRaw.trim().length === 0) {
    throw new Error(`${errorPrefix} "pinnedMenu.sourceDir" must be a non-empty string`);
  }

  const normalizedSourceDir = sourceDirRaw
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!normalizedSourceDir) {
    throw new Error(`${errorPrefix} "pinnedMenu.sourceDir" must not be root`);
  }

  const label =
    typeof labelRaw === "string" && labelRaw.trim().length > 0
      ? labelRaw.trim()
      : "NOTICE";

  return {
    label,
    sourceDir: normalizedSourceDir,
  };
}

function normalizeStaticPaths(raw: unknown, errorPrefix = "[config]"): string[] {
  if (raw == null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error(`${errorPrefix} "staticPaths" must be an array of strings`);
  }

  const normalized = new Set<string>();
  for (const [index, value] of raw.entries()) {
    if (typeof value !== "string") {
      throw new Error(`${errorPrefix} "staticPaths[${index}]" must be a string`);
    }

    const cleaned = value
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.\/+/, "")
      .replace(/\/+$/, "");

    if (
      !cleaned ||
      cleaned === "." ||
      cleaned === ".." ||
      cleaned.startsWith("../") ||
      cleaned.startsWith("/") ||
      path.isAbsolute(value.trim())
    ) {
      throw new Error(
        `${errorPrefix} "staticPaths[${index}]" must be a non-empty vault-relative path (for example: "assets")`,
      );
    }

    normalized.add(cleaned);
  }

  return Array.from(normalized);
}

export async function loadPinnedMenuConfig(
  configPath: string | undefined,
  cwd = process.cwd(),
): Promise<PinnedMenuOption | null> {
  if (!configPath) {
    return null;
  }

  const absolute = path.resolve(cwd, configPath);
  const file = Bun.file(absolute);
  if (!(await file.exists())) {
    throw new Error(`[menu-config] file not found: ${absolute}`);
  }

  let parsed: unknown;
  try {
    parsed = await file.json();
  } catch (error) {
    throw new Error(`[menu-config] failed to parse JSON: ${(error as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed == null) {
    throw new Error("[menu-config] top-level JSON must be an object");
  }

  return normalizePinnedMenu((parsed as Record<string, unknown>).pinnedMenu, "[menu-config]");
}

export function resolveBuildOptions(
  cli: CliArgs,
  userConfig: UserConfig,
  pinnedMenu: PinnedMenuOption | null,
  cwd = process.cwd(),
): BuildOptions {
  const vaultDir = path.resolve(cwd, cli.vaultDir ?? userConfig.vaultDir ?? DEFAULTS.vaultDir);
  const outDir = path.resolve(cwd, cli.outDir ?? userConfig.outDir ?? DEFAULTS.outDir);
  const cfgExclude = userConfig.exclude ?? [];
  const cliExclude = cli.exclude ?? [];
  const mergedExclude = Array.from(new Set([...DEFAULTS.exclude, ...cfgExclude, ...cliExclude]));
  const staticPaths = normalizeStaticPaths(userConfig.staticPaths, "[config]");
  const seo = normalizeSeoConfig(userConfig.seo);
  const siteTitleRaw = userConfig.seo?.siteName ?? userConfig.seo?.defaultTitle;
  const siteTitle =
    typeof siteTitleRaw === "string" && siteTitleRaw.trim().length > 0
      ? siteTitleRaw.trim()
      : undefined;
  const configPinnedMenu = normalizePinnedMenu(userConfig.pinnedMenu, "[config]");
  const resolvedPinnedMenu = pinnedMenu ?? configPinnedMenu;

  return {
    vaultDir,
    outDir,
    exclude: mergedExclude,
    staticPaths,
    newWithinDays: cli.newWithinDays ?? userConfig.ui?.newWithinDays ?? DEFAULTS.newWithinDays,
    recentLimit: cli.recentLimit ?? userConfig.ui?.recentLimit ?? DEFAULTS.recentLimit,
    siteTitle,
    pinnedMenu: resolvedPinnedMenu,
    wikilinks: userConfig.markdown?.wikilinks ?? DEFAULTS.wikilinks,
    imagePolicy: userConfig.markdown?.images ?? DEFAULTS.imagePolicy,
    gfm: userConfig.markdown?.gfm ?? DEFAULTS.gfm,
    shikiTheme: userConfig.markdown?.highlight?.theme ?? DEFAULTS.shikiTheme,
    seo,
  };
}

export function printHelp(): void {
  console.log(`
Usage:
  blog build [options]
  blog dev [options]
  blog clean [options]

Options:
  --vault <path>            Vault root directory (default: .)
  --out <path>              Output directory (default: dist)
  --exclude <glob>          Exclude glob pattern (repeatable)
  --new-within-days <n>     NEW badge threshold days (default: 7)
  --recent-limit <n>        Recent virtual folder item count (default: 5)
  --menu-config <path>      JSON file path to override pinnedMenu (optional)
  --port <n>                Dev server port (default: 3000)
  -h, --help                Show help
`);
}
