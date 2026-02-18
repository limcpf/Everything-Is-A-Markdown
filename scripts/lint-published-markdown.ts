#!/usr/bin/env bun
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import matter from "gray-matter";
import { loadUserConfig, resolveBuildOptions, type CliArgs } from "../src/config";
import { buildExcluder, relativePosix } from "../src/utils";

const require = createRequire(import.meta.url);
const markdownlint = require("markdownlint") as {
  promises: {
    markdownlint(options: {
      strings: Record<string, string>;
      config: Record<string, unknown>;
      frontMatter?: RegExp;
    }): Promise<Record<string, Array<Record<string, unknown>>>>;
  };
};
const lintConfigModule = require("../.markdownlint.cjs") as { config: Record<string, unknown> };

const REPORT_FILE_NAME = "mdlint-report.json";
const FRONTMATTER_RE = /^---\s*[\r\n]+[\s\S]*?[\r\n]+---\s*(?:[\r\n]+|$)/;
const ATX_H1_RE = /^\s{0,3}#(?!#)\s+\S/;
const SETEXT_H1_UNDERLINE_RE = /^\s*=+\s*$/;
const FENCE_RE = /^\s{0,3}(```+|~~~+)/;

interface LintCliArgs {
  outDir?: string;
  strict: boolean;
  vaultDir?: string;
  exclude: string[];
  help: boolean;
}

interface TargetDoc {
  absPath: string;
  relPath: string;
  raw: string;
}

interface LintIssue {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
  severity: "error";
}

interface TargetScanResult {
  docs: TargetDoc[];
  issues: LintIssue[];
  skippedWithoutPrefix: string[];
}

function printHelp(): void {
  console.log(`
Usage:
  bun run lint:md:publish -- --out-dir <path> [--strict] [--vault <path>] [--exclude <glob>]

Options:
  --out-dir <path>      JSON 리포트 저장 디렉터리 (필수)
  --strict              위반이 있으면 종료 코드 1
  --vault <path>        Markdown 루트 디렉터리 (선택, 기본 config/기본값 사용)
  --exclude <glob>      제외 패턴 추가 (반복 가능)
  -h, --help            도움말 출력
`);
}

function parseCliArgs(argv: string[]): LintCliArgs {
  const parsed: LintCliArgs = {
    strict: false,
    exclude: [],
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }
    if (token === "--out-dir") {
      const value = argv[++i];
      if (!value) {
        throw new Error("Missing value for --out-dir");
      }
      parsed.outDir = value;
      continue;
    }
    if (token === "--strict") {
      parsed.strict = true;
      continue;
    }
    if (token === "--vault") {
      const value = argv[++i];
      if (!value) {
        throw new Error("Missing value for --vault");
      }
      parsed.vaultDir = value;
      continue;
    }
    if (token === "--exclude") {
      const value = argv[++i];
      if (!value) {
        throw new Error("Missing value for --exclude");
      }
      parsed.exclude.push(value);
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return parsed;
}

async function walkMarkdownFiles(
  rootDir: string,
  currentDir: string,
  isExcluded: (relPath: string, isDirectory: boolean) => boolean,
  output: string[],
): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(currentDir, entry.name);
    const relPath = relativePosix(rootDir, absPath);
    if (isExcluded(relPath, entry.isDirectory())) {
      continue;
    }
    if (entry.isDirectory()) {
      await walkMarkdownFiles(rootDir, absPath, isExcluded, output);
      continue;
    }
    if (entry.isFile() && /\.md$/i.test(entry.name)) {
      output.push(absPath);
    }
  }
}

async function collectPublishedDocs(vaultDir: string, excludePatterns: string[]): Promise<TargetScanResult> {
  const files: string[] = [];
  const issues: LintIssue[] = [];
  const skippedWithoutPrefix: string[] = [];
  const isExcluded = buildExcluder(excludePatterns);
  await walkMarkdownFiles(vaultDir, vaultDir, isExcluded, files);
  files.sort((left, right) => left.localeCompare(right, "ko-KR"));

  const docs: TargetDoc[] = [];
  for (const absPath of files) {
    const relPath = relativePosix(vaultDir, absPath);
    const raw = await Bun.file(absPath).text();

    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw);
    } catch (error) {
      issues.push({
        file: relPath,
        line: 1,
        column: 1,
        rule: "frontmatter/parse",
        message: `Frontmatter parse failed: ${(error as Error).message}`,
        severity: "error",
      });
      continue;
    }

    if (parsed.data.publish !== true || parsed.data.draft === true) {
      continue;
    }
    const hasPrefix = typeof parsed.data.prefix === "string" && parsed.data.prefix.trim().length > 0;
    if (!hasPrefix) {
      skippedWithoutPrefix.push(relPath);
      continue;
    }

    docs.push({ absPath, relPath, raw });
  }

  return { docs, issues, skippedWithoutPrefix };
}

function findFrontmatterEndLine(lines: string[]): number {
  if (lines.length === 0 || lines[0].trim() !== "---") {
    return 0;
  }
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      return i + 1;
    }
  }
  return 0;
}

function collectBodyH1Issues(doc: TargetDoc): LintIssue[] {
  const lines = doc.raw.split(/\r?\n/);
  const issues: LintIssue[] = [];
  const startLine = findFrontmatterEndLine(lines);

  let inFence = false;
  let fenceChar: "`" | "~" | null = null;

  for (let i = startLine; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const currentFenceChar = fenceMatch[1][0] as "`" | "~";
      if (!inFence) {
        inFence = true;
        fenceChar = currentFenceChar;
      } else if (fenceChar === currentFenceChar) {
        inFence = false;
        fenceChar = null;
      }
      continue;
    }
    if (inFence) {
      continue;
    }

    const trimmedStart = line.trimStart();
    if (!trimmedStart.startsWith("\\#") && ATX_H1_RE.test(line)) {
      issues.push({
        file: doc.relPath,
        line: i + 1,
        column: 1,
        rule: "custom/no-h1-body",
        message: "본문에서는 H1(`#`)을 사용할 수 없습니다. H2(`##`)부터 사용하세요.",
        severity: "error",
      });
    }

    if (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (line.trim().length > 0 && SETEXT_H1_UNDERLINE_RE.test(next.trim())) {
        issues.push({
          file: doc.relPath,
          line: i + 2,
          column: 1,
          rule: "custom/no-h1-body",
          message: "본문에서는 Setext H1(`===`)을 사용할 수 없습니다. H2(`##`)부터 사용하세요.",
          severity: "error",
        });
      }
    }
  }

  return issues;
}

function mapMarkdownlintIssues(results: Record<string, Array<Record<string, unknown>>>): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const [file, fileIssues] of Object.entries(results)) {
    for (const issue of fileIssues) {
      const ruleNames = Array.isArray(issue.ruleNames) ? issue.ruleNames : [];
      const rule = typeof ruleNames[0] === "string" ? ruleNames[0] : "markdownlint/unknown";
      const line = typeof issue.lineNumber === "number" ? issue.lineNumber : 1;
      const errorRange = Array.isArray(issue.errorRange) ? issue.errorRange : [];
      const column = typeof errorRange[0] === "number" ? errorRange[0] : 1;
      const description = typeof issue.ruleDescription === "string" ? issue.ruleDescription : "Markdown lint violation";
      const detail = typeof issue.errorDetail === "string" && issue.errorDetail.length > 0 ? `: ${issue.errorDetail}` : "";

      issues.push({
        file,
        line,
        column,
        rule,
        message: `${description}${detail}`,
        severity: "error",
      });
    }
  }
  return issues;
}

function sortIssues(issues: LintIssue[]): LintIssue[] {
  return [...issues].sort((left, right) => {
    const byFile = left.file.localeCompare(right.file, "ko-KR");
    if (byFile !== 0) {
      return byFile;
    }
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.column - right.column;
  });
}

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    return;
  }
  if (!cli.outDir || cli.outDir.trim().length === 0) {
    throw new Error('Missing required option: --out-dir <path>');
  }

  const userConfig = await loadUserConfig();
  const buildCli: CliArgs = {
    command: "build",
    help: false,
    vaultDir: cli.vaultDir,
    exclude: cli.exclude,
  };
  const buildOptions = resolveBuildOptions(buildCli, userConfig, null);

  const scanResult = await collectPublishedDocs(buildOptions.vaultDir, buildOptions.exclude);
  const lintStrings = Object.fromEntries(scanResult.docs.map((doc) => [doc.relPath, doc.raw]));

  const lintResults =
    scanResult.docs.length > 0
      ? await markdownlint.promises.markdownlint({
          strings: lintStrings,
          config: lintConfigModule.config,
          frontMatter: FRONTMATTER_RE,
        })
      : {};

  const markdownlintIssues = mapMarkdownlintIssues(lintResults);
  const bodyHeadingIssues = scanResult.docs.flatMap((doc) => collectBodyH1Issues(doc));
  const allIssues = sortIssues([...scanResult.issues, ...markdownlintIssues, ...bodyHeadingIssues]);

  const outDir = path.resolve(process.cwd(), cli.outDir);
  await fs.mkdir(outDir, { recursive: true });

  const reportPath = path.join(outDir, REPORT_FILE_NAME);
  const report = {
    generatedAt: new Date().toISOString(),
    vaultDir: buildOptions.vaultDir,
    targetCount: scanResult.docs.length,
    skippedWithoutPrefixCount: scanResult.skippedWithoutPrefix.length,
    issueCount: allIssues.length,
    strict: cli.strict,
    issues: allIssues,
  };
  await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`[lint:md:publish] targets=${scanResult.docs.length} issues=${allIssues.length} out=${reportPath}`);
  if (scanResult.skippedWithoutPrefix.length > 0) {
    console.warn(`[lint:md:publish] skipped without prefix: ${scanResult.skippedWithoutPrefix.length}`);
  }

  if (cli.strict && allIssues.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
