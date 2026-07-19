import path from "node:path";
import { pathToFileURL } from "node:url";
import { OUTPUT_MARKER_FILE_NAME } from "./build/shared";
import { DEFAULT_RUNTIME_CONFIG } from "./defaults";
import { normalizeSeoConfig } from "./seo";
import type { BuildOptions, PinnedMenuOption, UserConfig, UserSeoConfig } from "./types";

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
  allowUnsafeHtml: false,
  shikiTheme: "github-dark",
  defaultBranch: DEFAULT_RUNTIME_CONFIG.defaultBranch,
  mermaid: DEFAULT_RUNTIME_CONFIG.mermaid,
};

const MERMAID_URL_MAX_LENGTH = 1024;
const MERMAID_THEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]*$/;
const MERMAID_CDN_URL_PATTERN = /^(https?:\/\/|\/|\.{1,2}\/)[^\s"'><]+$/;

type ConfigWarningHandler = (message: string) => void;

export type ValidatedUserConfig = Omit<UserConfig, "pinnedMenu"> & {
  pinnedMenu?: PinnedMenuOption;
};

function defaultConfigWarning(message: string): void {
  console.warn(message);
}

function receivedValue(value: unknown): string {
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  let preview: string | undefined;

  if (typeof value === "string") {
    const shortened = value.length > 120 ? `${value.slice(0, 117)}...` : value;
    preview = JSON.stringify(shortened);
  } else if (typeof value === "number" || typeof value === "boolean") {
    preview = String(value);
  } else if (typeof value === "bigint") {
    preview = `${String(value)}n`;
  }

  return preview === undefined ? type : `${type} (${preview})`;
}

function invalidValue(
  errorPrefix: string,
  field: string,
  expectation: string,
  value: unknown,
): never {
  throw new Error(
    `${errorPrefix} "${field}" must be ${expectation}; received ${receivedValue(value)}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(
  value: unknown,
  field: string,
  errorPrefix = "[config]",
): Record<string, unknown> {
  if (!isRecord(value)) {
    invalidValue(errorPrefix, field, "a plain object", value);
  }
  return value;
}

function warnUnknownFields(
  record: Record<string, unknown>,
  allowedFields: readonly string[],
  parentPath: string,
  errorPrefix: string,
  warn: ConfigWarningHandler,
): void {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      const field = parentPath ? `${parentPath}.${key}` : key;
      warn(`${errorPrefix} unknown field "${field}" will be ignored`);
    }
  }
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  field: string,
  options: { trim?: boolean; allowEmpty?: boolean } = {},
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    invalidValue("[config]", field, "a string", value);
  }

  const normalized = options.trim ? value.trim() : value;
  if (options.allowEmpty === false && normalized.length === 0) {
    invalidValue("[config]", field, "a non-empty string", value);
  }
  return normalized;
}

function optionalBoolean(
  record: Record<string, unknown>,
  key: string,
  field: string,
): boolean | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    invalidValue("[config]", field, "a boolean", value);
  }
  return value;
}

function optionalInteger(
  record: Record<string, unknown>,
  key: string,
  field: string,
  min: number,
): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < min
  ) {
    invalidValue("[config]", field, `an integer >= ${min}`, value);
  }
  return value;
}

function normalizeStringArray(raw: unknown, field: string): string[] {
  if (!Array.isArray(raw)) {
    invalidValue("[config]", field, "an array of strings", raw);
  }

  return raw.map((value, index) => {
    if (typeof value !== "string") {
      invalidValue("[config]", `${field}[${index}]`, "a string", value);
    }
    return value;
  });
}

function normalizeMermaidCdnUrl(
  value: string | undefined,
  warn: ConfigWarningHandler = defaultConfigWarning,
): string {
  if (value === undefined) {
    return DEFAULTS.mermaid.cdnUrl;
  }

  const normalized = value.trim();
  if (!normalized) {
    return DEFAULTS.mermaid.cdnUrl;
  }

  if (normalized.length > MERMAID_URL_MAX_LENGTH || !MERMAID_CDN_URL_PATTERN.test(normalized)) {
    warn(
      `[config] "markdown.mermaid.cdnUrl" has an invalid string value ${JSON.stringify(value)}; using default ${JSON.stringify(DEFAULTS.mermaid.cdnUrl)}`,
    );
    return DEFAULTS.mermaid.cdnUrl;
  }

  return normalized;
}

function normalizeMermaidTheme(
  value: string | undefined,
  warn: ConfigWarningHandler = defaultConfigWarning,
): string {
  if (value === undefined) {
    return DEFAULTS.mermaid.theme;
  }

  const normalized = value.trim();
  if (!MERMAID_THEME_PATTERN.test(normalized)) {
    warn(
      `[config] "markdown.mermaid.theme" has an invalid string value ${JSON.stringify(value)}; using default ${JSON.stringify(DEFAULTS.mermaid.theme)}`,
    );
    return DEFAULTS.mermaid.theme;
  }

  return normalized;
}

function readOptionValue(
  args: string[],
  optionIndex: number,
  option: string,
  allowNegativeNumber = false,
): string {
  const value = args[optionIndex + 1];
  const isFlagShaped = !value || value.startsWith("-");
  const isNegativeNumber =
    allowNegativeNumber &&
    typeof value === "string" &&
    value.startsWith("-") &&
    !Number.isNaN(Number(value));

  if (!value || (isFlagShaped && !isNegativeNumber)) {
    throw new Error(`[cli] Missing value for ${option}`);
  }

  return value;
}

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
      parsed.vaultDir = readOptionValue(rest, i, token);
      i += 1;
      continue;
    }
    if (token === "--out") {
      parsed.outDir = readOptionValue(rest, i, token);
      i += 1;
      continue;
    }
    if (token === "--exclude") {
      parsed.exclude.push(readOptionValue(rest, i, token));
      i += 1;
      continue;
    }
    if (token === "--new-within-days") {
      parsed.newWithinDays = Number(readOptionValue(rest, i, token, true));
      i += 1;
      continue;
    }
    if (token === "--recent-limit") {
      parsed.recentLimit = Number(readOptionValue(rest, i, token, true));
      i += 1;
      continue;
    }
    if (token === "--menu-config") {
      parsed.menuConfigPath = readOptionValue(rest, i, token);
      i += 1;
      continue;
    }
    if (token === "--port") {
      parsed.port = Number(readOptionValue(rest, i, token, true));
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return parsed;
}

export async function loadUserConfig(cwd = process.cwd()): Promise<ValidatedUserConfig> {
  const candidates = ["blog.config.ts", "blog.config.js", "blog.config.mjs", "blog.config.cjs"];

  for (const fileName of candidates) {
    const absolute = path.join(cwd, fileName);
    const file = Bun.file(absolute);
    if (!(await file.exists())) {
      continue;
    }

    const imported = await import(pathToFileURL(absolute).href);
    const raw =
      imported.default ??
      Object.fromEntries(Object.entries(imported).filter(([key]) => key !== "default"));
    return validateUserConfig(raw);
  }

  return validateUserConfig({});
}

function normalizePinnedMenu(
  raw: unknown,
  errorPrefix = "[config]",
  warn: ConfigWarningHandler = defaultConfigWarning,
): PinnedMenuOption | null {
  if (raw === undefined) {
    return null;
  }

  const menu = requireRecord(raw, "pinnedMenu", errorPrefix);
  warnUnknownFields(menu, ["label", "sourceDir", "categoryPath"], "pinnedMenu", errorPrefix, warn);
  const sourceDirRaw = menu.sourceDir;
  const categoryPathRaw = menu.categoryPath;
  const labelRaw = menu.label;
  const normalizeMenuPath = (
    value: unknown,
    fieldName: "sourceDir" | "categoryPath",
  ): string | undefined => {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "string" || value.trim().length === 0) {
      invalidValue(errorPrefix, `pinnedMenu.${fieldName}`, "a non-empty string", value);
    }

    const normalized = value
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join("/");

    if (!normalized) {
      throw new Error(
        `${errorPrefix} "pinnedMenu.${fieldName}" must not be root; received ${receivedValue(value)}`,
      );
    }

    return normalized;
  };

  const normalizedSourceDir = normalizeMenuPath(sourceDirRaw, "sourceDir");
  const normalizedCategoryPath = normalizeMenuPath(categoryPathRaw, "categoryPath");

  if (!normalizedSourceDir && !normalizedCategoryPath) {
    throw new Error(
      `${errorPrefix} "pinnedMenu" must include "sourceDir" or "categoryPath"; received object`,
    );
  }

  if (labelRaw !== undefined && typeof labelRaw !== "string") {
    invalidValue(errorPrefix, "pinnedMenu.label", "a string", labelRaw);
  }
  const label = typeof labelRaw === "string" && labelRaw.trim() ? labelRaw.trim() : "NOTICE";

  return {
    label,
    sourceDir: normalizedSourceDir,
    categoryPath: normalizedCategoryPath,
  };
}

function normalizeStaticPaths(raw: unknown, errorPrefix = "[config]"): string[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    invalidValue(errorPrefix, "staticPaths", "an array of strings", raw);
  }

  const normalized = new Set<string>();
  for (const [index, value] of raw.entries()) {
    if (typeof value !== "string") {
      invalidValue(errorPrefix, `staticPaths[${index}]`, "a string", value);
    }

    const cleaned = value
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.\/+/, "")
      .replace(/\/+$/, "");

    if (
      !cleaned ||
      cleaned.startsWith("/") ||
      path.isAbsolute(value.trim()) ||
      path.win32.isAbsolute(value.trim())
    ) {
      throw new Error(
        `${errorPrefix} "staticPaths[${index}]" must be a non-empty vault-relative path (for example: "assets"); received ${receivedValue(value)}`,
      );
    }

    const normalizedPath = path.posix.normalize(cleaned);
    if (normalizedPath === ".") {
      throw new Error(
        `${errorPrefix} "staticPaths[${index}]" is invalid: Refusing static path that resolves to the vault root; received ${receivedValue(value)}`,
      );
    }
    if (normalizedPath === ".." || normalizedPath.startsWith("../")) {
      throw new Error(
        `${errorPrefix} "staticPaths[${index}]" is invalid: Refusing static output path outside the output directory; received ${receivedValue(value)}`,
      );
    }
    if (
      normalizedPath === OUTPUT_MARKER_FILE_NAME ||
      normalizedPath.startsWith(`${OUTPUT_MARKER_FILE_NAME}/`)
    ) {
      throw new Error(
        `${errorPrefix} "staticPaths[${index}]" is invalid: Refusing reserved static output path; received ${receivedValue(value)}`,
      );
    }

    normalized.add(normalizedPath);
  }

  return Array.from(normalized);
}

function normalizeUiConfig(
  raw: unknown,
  warn: ConfigWarningHandler,
): NonNullable<UserConfig["ui"]> {
  const ui = requireRecord(raw, "ui");
  warnUnknownFields(ui, ["newWithinDays", "recentLimit"], "ui", "[config]", warn);

  return {
    newWithinDays: optionalInteger(ui, "newWithinDays", "ui.newWithinDays", 0),
    recentLimit: optionalInteger(ui, "recentLimit", "ui.recentLimit", 1),
  };
}

function normalizeMarkdownConfig(
  raw: unknown,
  warn: ConfigWarningHandler,
): NonNullable<UserConfig["markdown"]> {
  const markdown = requireRecord(raw, "markdown");
  warnUnknownFields(
    markdown,
    ["wikilinks", "images", "gfm", "allowUnsafeHtml", "highlight", "mermaid"],
    "markdown",
    "[config]",
    warn,
  );

  const normalized: NonNullable<UserConfig["markdown"]> = {
    wikilinks: optionalBoolean(markdown, "wikilinks", "markdown.wikilinks"),
    gfm: optionalBoolean(markdown, "gfm", "markdown.gfm"),
    allowUnsafeHtml: optionalBoolean(markdown, "allowUnsafeHtml", "markdown.allowUnsafeHtml"),
  };

  const images = markdown.images;
  if (images !== undefined) {
    if (images !== "keep" && images !== "omit-local") {
      invalidValue("[config]", "markdown.images", '"keep" or "omit-local"', images);
    }
    normalized.images = images;
  }

  if (markdown.highlight !== undefined) {
    const highlight = requireRecord(markdown.highlight, "markdown.highlight");
    warnUnknownFields(highlight, ["engine", "theme"], "markdown.highlight", "[config]", warn);

    const engine = highlight.engine;
    if (engine !== undefined && engine !== "shiki") {
      invalidValue("[config]", "markdown.highlight.engine", '"shiki"', engine);
    }
    normalized.highlight = {
      engine,
      theme: optionalString(highlight, "theme", "markdown.highlight.theme", {
        trim: true,
        allowEmpty: false,
      }),
    };
  }

  if (markdown.mermaid !== undefined) {
    const mermaid = requireRecord(markdown.mermaid, "markdown.mermaid");
    warnUnknownFields(
      mermaid,
      ["enabled", "cdnUrl", "theme"],
      "markdown.mermaid",
      "[config]",
      warn,
    );

    const cdnUrl = optionalString(mermaid, "cdnUrl", "markdown.mermaid.cdnUrl");
    const theme = optionalString(mermaid, "theme", "markdown.mermaid.theme");
    normalized.mermaid = {
      enabled: optionalBoolean(mermaid, "enabled", "markdown.mermaid.enabled"),
      cdnUrl: cdnUrl === undefined ? undefined : normalizeMermaidCdnUrl(cdnUrl, warn),
      theme: theme === undefined ? undefined : normalizeMermaidTheme(theme, warn),
    };
  }

  return normalized;
}

function normalizeSeoUserConfig(raw: unknown, warn: ConfigWarningHandler): UserSeoConfig {
  const seo = requireRecord(raw, "seo");
  warnUnknownFields(
    seo,
    [
      "siteUrl",
      "pathBase",
      "siteName",
      "defaultTitle",
      "defaultDescription",
      "locale",
      "twitterCard",
      "twitterSite",
      "twitterCreator",
      "defaultSocialImage",
      "defaultOgImage",
      "defaultTwitterImage",
    ],
    "seo",
    "[config]",
    warn,
  );

  const normalizeSeoString = (key: string): string | undefined => {
    const value = optionalString(seo, key, `seo.${key}`, { trim: true });
    return value ? value : undefined;
  };
  const siteUrl = optionalString(seo, "siteUrl", "seo.siteUrl", {
    trim: true,
    allowEmpty: false,
  });
  const twitterCard = seo.twitterCard;
  if (
    twitterCard !== undefined &&
    twitterCard !== "summary" &&
    twitterCard !== "summary_large_image"
  ) {
    invalidValue("[config]", "seo.twitterCard", '"summary" or "summary_large_image"', twitterCard);
  }

  const normalized: UserSeoConfig = {
    siteUrl,
    pathBase: optionalString(seo, "pathBase", "seo.pathBase", { trim: true }),
    siteName: normalizeSeoString("siteName"),
    defaultTitle: normalizeSeoString("defaultTitle"),
    defaultDescription: normalizeSeoString("defaultDescription"),
    locale: normalizeSeoString("locale"),
    twitterCard,
    twitterSite: normalizeSeoString("twitterSite"),
    twitterCreator: normalizeSeoString("twitterCreator"),
    defaultSocialImage: normalizeSeoString("defaultSocialImage"),
    defaultOgImage: normalizeSeoString("defaultOgImage"),
    defaultTwitterImage: normalizeSeoString("defaultTwitterImage"),
  };

  const buildSeo = normalizeSeoConfig(normalized);
  return buildSeo ?? normalized;
}

/** Validate and normalize the complete public config shape before build storage is inspected. */
export function validateUserConfig(
  raw: unknown,
  warn: ConfigWarningHandler = defaultConfigWarning,
): ValidatedUserConfig {
  const config = requireRecord(raw, "<root>");
  warnUnknownFields(
    config,
    [
      "vaultDir",
      "outDir",
      "defaultBranch",
      "exclude",
      "staticPaths",
      "pinnedMenu",
      "ui",
      "markdown",
      "seo",
    ],
    "",
    "[config]",
    warn,
  );

  const normalized: ValidatedUserConfig = {};
  const vaultDir = optionalString(config, "vaultDir", "vaultDir");
  const outDir = optionalString(config, "outDir", "outDir");
  const defaultBranch = optionalString(config, "defaultBranch", "defaultBranch", {
    trim: true,
    allowEmpty: false,
  });

  if (vaultDir !== undefined) normalized.vaultDir = vaultDir;
  if (outDir !== undefined) normalized.outDir = outDir;
  if (defaultBranch !== undefined) normalized.defaultBranch = defaultBranch.toLowerCase();
  if (config.exclude !== undefined)
    normalized.exclude = normalizeStringArray(config.exclude, "exclude");
  if (config.staticPaths !== undefined) {
    normalized.staticPaths = normalizeStaticPaths(config.staticPaths);
  }
  if (config.pinnedMenu !== undefined) {
    const pinnedMenu = normalizePinnedMenu(config.pinnedMenu, "[config]", warn);
    if (pinnedMenu) normalized.pinnedMenu = pinnedMenu;
  }
  if (config.ui !== undefined) normalized.ui = normalizeUiConfig(config.ui, warn);
  if (config.markdown !== undefined) {
    normalized.markdown = normalizeMarkdownConfig(config.markdown, warn);
  }
  if (config.seo !== undefined) normalized.seo = normalizeSeoUserConfig(config.seo, warn);

  return normalized;
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
    throw new Error(`[menu-config] failed to parse JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }

  const menuConfig = requireRecord(parsed, "<root>", "[menu-config]");
  warnUnknownFields(menuConfig, ["pinnedMenu"], "", "[menu-config]", defaultConfigWarning);
  return normalizePinnedMenu(menuConfig.pinnedMenu, "[menu-config]", defaultConfigWarning);
}

function ensureIntegerOption(value: unknown, optionLabel: string, min: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < min
  ) {
    invalidValue("[cli]", optionLabel, `an integer >= ${min}`, value);
  }
  return value;
}

export function resolveBuildOptions(
  cli: CliArgs,
  userConfig: unknown,
  pinnedMenu: PinnedMenuOption | null,
  cwd = process.cwd(),
): BuildOptions {
  const config = validateUserConfig(userConfig);
  const vaultDir = path.resolve(cwd, cli.vaultDir ?? config.vaultDir ?? DEFAULTS.vaultDir);
  const outDir = path.resolve(cwd, cli.outDir ?? config.outDir ?? DEFAULTS.outDir);
  const cfgExclude = config.exclude ?? [];
  const cliExclude = cli.exclude ?? [];
  const mergedExclude = Array.from(new Set([...DEFAULTS.exclude, ...cfgExclude, ...cliExclude]));
  const staticPaths = config.staticPaths ?? [];
  const seo = normalizeSeoConfig(config.seo);
  const siteTitleRaw = config.seo?.siteName ?? config.seo?.defaultTitle;
  const siteTitle =
    typeof siteTitleRaw === "string" && siteTitleRaw.trim().length > 0
      ? siteTitleRaw.trim()
      : undefined;
  const resolvedPinnedMenu = pinnedMenu ?? config.pinnedMenu ?? null;
  const newWithinDays = ensureIntegerOption(
    cli.newWithinDays ?? config.ui?.newWithinDays ?? DEFAULTS.newWithinDays,
    "--new-within-days",
    0,
  );
  const recentLimit = ensureIntegerOption(
    cli.recentLimit ?? config.ui?.recentLimit ?? DEFAULTS.recentLimit,
    "--recent-limit",
    1,
  );

  return {
    vaultDir,
    outDir,
    exclude: mergedExclude,
    staticPaths,
    newWithinDays,
    recentLimit,
    defaultBranch: config.defaultBranch ?? DEFAULTS.defaultBranch,
    siteTitle,
    pinnedMenu: resolvedPinnedMenu,
    wikilinks: config.markdown?.wikilinks ?? DEFAULTS.wikilinks,
    imagePolicy: config.markdown?.images ?? DEFAULTS.imagePolicy,
    gfm: config.markdown?.gfm ?? DEFAULTS.gfm,
    allowUnsafeHtml: config.markdown?.allowUnsafeHtml ?? DEFAULTS.allowUnsafeHtml,
    shikiTheme: config.markdown?.highlight?.theme ?? DEFAULTS.shikiTheme,
    mermaid: {
      enabled: config.markdown?.mermaid?.enabled ?? DEFAULTS.mermaid.enabled,
      cdnUrl: config.markdown?.mermaid?.cdnUrl ?? DEFAULTS.mermaid.cdnUrl,
      theme: config.markdown?.mermaid?.theme ?? DEFAULTS.mermaid.theme,
    },
    layout: { ...DEFAULT_RUNTIME_CONFIG.layout },
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
