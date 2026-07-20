#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { buildSite } from "../src/build";
import { readPublishedDocs } from "../src/build/source";
import {
  loadUserConfig,
  loadUserConfigFile,
  resolveBuildOptions,
  type CliArgs,
} from "../src/config";
import type { BuildOptions } from "../src/types";
import {
  MARKDOWN_REPORT_FILE_NAME,
  addValidationCheck,
  canonicalizePath,
  compareOutputSnapshots,
  createProductionReport,
  markValidationCheckSkipped,
  parseProductionValidationArgs,
  pathsOverlap,
  snapshotOutput,
  validateCacheHeaders,
  validateInternalReferences,
  validateManifestGraph,
  validateMarkdownGate,
  validateSeoArtifacts,
  writeProductionReport,
  type ProductionValidationReport,
} from "./production-validation";

const CHECK_IDS = [
  "production-config",
  "production-build",
  "deterministic-output",
  "markdown-publication",
  "manifest-links",
  "seo-host-artifacts",
  "cache-headers",
  "output-budgets",
] as const;
const PUBLISHED_MARKDOWN_LINT_SCRIPT = path.join(import.meta.dir, "lint-published-markdown.ts");
const OUTPUT_SIZE_SCRIPT = path.join(import.meta.dir, "check-output-size.ts");

function printHelp(): void {
  console.log(`
Usage:
  bun run validate:production -- [options]

Options:
  --config <path>              Explicit blog.config.* file
  --vault <path>               Override the Markdown vault directory
  --out <path>                 Override the production output directory
  --report-dir <path>          Report directory (default: .reports/production-validation)
  --markdown-baseline <path>   Intentional strict Markdown finding fingerprints
  --exclude <glob>             Additional exclusion pattern (repeatable)
  -h, --help                   Show help
`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runBunScript(args: string[]): { status: number; output: string } {
  const result = spawnSync("bun", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (output) process.stdout.write(output);
  return { status: result.status ?? 1, output };
}

function skipRemaining(report: ProductionValidationReport): void {
  const seen = new Set(report.checks.map(({ id }) => id));
  for (const id of CHECK_IDS) {
    if (!seen.has(id)) {
      markValidationCheckSkipped(report, id, "Skipped after an earlier fatal failure");
    }
  }
}

async function finish(report: ProductionValidationReport): Promise<never> {
  skipRemaining(report);
  const reportPath = await writeProductionReport(report);
  console.log(`[validate:production] ${report.status} report=${reportPath}`);
  process.exit(report.status === "passed" ? 0 : 1);
  throw new Error("unreachable after process.exit");
}

async function relocateOverlappingReportDirectory(
  report: ProductionValidationReport,
  outDir: string,
): Promise<boolean> {
  const canonicalOutDir = await canonicalizePath(outDir);
  const canonicalReportDir = await canonicalizePath(report.configuration.reportDir);
  if (!pathsOverlap(canonicalOutDir, canonicalReportDir)) return false;

  const requestedReportDir = report.configuration.reportDir;
  const resolvedOutDir = path.resolve(outDir);
  const outputName = path.basename(resolvedOutDir) || "output";
  const candidates = [
    path.join(path.dirname(resolvedOutDir), `.${outputName}-production-validation-report`),
    path.join(process.cwd(), ".reports", `production-validation-fallback-${process.pid}`),
  ];
  for (const candidate of candidates) {
    const canonicalCandidate = await canonicalizePath(candidate);
    if (pathsOverlap(canonicalOutDir, canonicalCandidate)) continue;
    report.configuration.requestedReportDir = requestedReportDir;
    report.configuration.reportDir = candidate;
    return true;
  }
  throw new Error("Unable to select a production report directory outside the output directory");
}

async function validateResolvedProduction(
  report: ProductionValidationReport,
  options: BuildOptions,
  args: ReturnType<typeof parseProductionValidationArgs>,
): Promise<never> {
  try {
    const firstBuild = await buildSite(options);
    const firstSnapshot = await snapshotOutput(options.outDir);
    const secondBuild = await buildSite(options);
    const secondSnapshot = await snapshotOutput(options.outDir);
    report.metrics.documents = secondBuild.totalDocs;
    report.metrics.outputFiles = Object.keys(secondSnapshot).length;
    report.metrics.outputBytes = Object.values(secondSnapshot).reduce(
      (total, entry) => total + entry.bytes,
      0,
    );
    addValidationCheck(
      report,
      "production-build",
      "Two production builds completed successfully",
      [],
      { firstBuild, secondBuild },
    );
    addValidationCheck(
      report,
      "deterministic-output",
      "Identical production builds emitted byte-identical files",
      compareOutputSnapshots(firstSnapshot, secondSnapshot),
      { fileCount: Object.keys(secondSnapshot).length },
    );
  } catch (error) {
    addValidationCheck(report, "production-build", "Production build failed", [
      errorMessage(error),
    ]);
    await finish(report);
  }

  try {
    const markdownReportPath = path.join(report.configuration.reportDir, MARKDOWN_REPORT_FILE_NAME);
    await fs.rm(markdownReportPath, { force: true });
    const lintArgs = [
      "run",
      PUBLISHED_MARKDOWN_LINT_SCRIPT,
      "--out-dir",
      report.configuration.reportDir,
      ...(args.configPath ? ["--config", args.configPath] : []),
      ...(args.vaultDir ? ["--vault", args.vaultDir] : []),
      ...args.exclude.flatMap((pattern) => ["--exclude", pattern]),
    ];
    const lintResult = runBunScript(lintArgs);
    const markdownFailures: string[] = [];
    let markdownDetails: Record<string, unknown> = { commandStatus: lintResult.status };
    try {
      const lintReport = JSON.parse(await fs.readFile(markdownReportPath, "utf8")) as unknown;
      const baseline = args.markdownBaselinePath
        ? (JSON.parse(
            await fs.readFile(path.resolve(args.markdownBaselinePath), "utf8"),
          ) as unknown)
        : undefined;
      const gate = validateMarkdownGate(lintReport, baseline);
      markdownFailures.push(...gate.failures);
      markdownDetails = { ...markdownDetails, ...gate };
    } catch (error) {
      markdownFailures.push(
        `Markdown validation report could not be evaluated: ${errorMessage(error)}`,
      );
    }
    if (lintResult.status !== 0) {
      markdownFailures.push("Published Markdown scanner exited unsuccessfully");
    }
    addValidationCheck(
      report,
      "markdown-publication",
      "Published Markdown is strict-clean or exactly matches its intentional baseline",
      markdownFailures,
      markdownDetails,
    );

    const { docs } = await readPublishedDocs(options, {});
    docs.sort((left, right) => left.relNoExt.localeCompare(right.relNoExt, "ko-KR"));
    const manifestResult = await validateManifestGraph(options.outDir, docs, options);
    const linkFailures = await validateInternalReferences(options.outDir, docs, options);
    addValidationCheck(
      report,
      "manifest-links",
      "Routes, content URLs, wikilinks, backlinks, static references, and generated links resolve",
      [...manifestResult.failures, ...linkFailures],
      { documentCount: docs.length },
    );

    if (manifestResult.manifest) {
      const seoFailures = await validateSeoArtifacts(
        options.outDir,
        docs,
        manifestResult.manifest,
        options,
      );
      addValidationCheck(
        report,
        "seo-host-artifacts",
        "Sitemap, robots, canonical metadata, 404, bootstrap, and pathBase are production-safe",
        seoFailures,
      );
    } else {
      addValidationCheck(report, "seo-host-artifacts", "SEO artifacts require a valid manifest", [
        "SEO validation could not proceed because manifest.json is invalid",
      ]);
    }

    addValidationCheck(
      report,
      "cache-headers",
      "Mutable output revalidates and exact content-hashed runtime assets are immutable",
      await validateCacheHeaders(options.outDir, options.seo?.pathBase ?? "", docs),
    );

    const sizeResult = runBunScript(["run", OUTPUT_SIZE_SCRIPT, "--out", options.outDir]);
    addValidationCheck(
      report,
      "output-budgets",
      "Bundle, bootstrap, manifest, and generated output budgets pass",
      sizeResult.status === 0
        ? []
        : ["Generated output exceeds a production size or structure budget"],
      { commandStatus: sizeResult.status, outputTail: sizeResult.output.slice(-12_000) },
    );
  } catch (error) {
    const seen = new Set(report.checks.map(({ id }) => id));
    const nextId = CHECK_IDS.find((id) => !seen.has(id)) ?? "production-validation";
    addValidationCheck(report, nextId, "Production validation encountered an unexpected error", [
      errorMessage(error),
    ]);
  }

  return finish(report);
}

async function main(): Promise<void> {
  const args = parseProductionValidationArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const report = createProductionReport(args);

  let options: BuildOptions;
  try {
    const userConfig = args.configPath
      ? await loadUserConfigFile(args.configPath)
      : await loadUserConfig();
    const buildCli: CliArgs = {
      command: "build",
      help: false,
      exclude: args.exclude,
      vaultDir: args.vaultDir,
      outDir: args.outDir,
    };
    options = resolveBuildOptions(buildCli, userConfig, null);
    report.configuration.vaultDir = options.vaultDir;
    report.configuration.outDir = options.outDir;
    report.configuration.siteUrl = options.seo?.siteUrl;
    report.configuration.pathBase = options.seo?.pathBase;

    const configFailures: string[] = [];
    if (!options.seo) configFailures.push("seo.siteUrl is required in production mode");
    if (await relocateOverlappingReportDirectory(report, options.outDir)) {
      configFailures.push("production output and report directories must not overlap");
    }
    try {
      const vaultStat = await fs.stat(options.vaultDir);
      if (!vaultStat.isDirectory()) {
        configFailures.push("production vault path must be a directory");
      }
    } catch {
      configFailures.push(`production vault directory does not exist: ${options.vaultDir}`);
    }
    for (const staticPath of options.staticPaths) {
      try {
        await fs.stat(path.resolve(options.vaultDir, staticPath));
      } catch {
        configFailures.push(`configured static path does not exist: ${staticPath}`);
      }
    }
    addValidationCheck(
      report,
      "production-config",
      "Production config has a canonical origin, readable inputs, and an isolated report path",
      configFailures,
    );
    if (configFailures.length > 0) return finish(report);
  } catch (error) {
    const catchFailures = [errorMessage(error)];
    try {
      if (await relocateOverlappingReportDirectory(report, path.resolve(args.outDir ?? "dist"))) {
        catchFailures.unshift("production output and report directories must not overlap");
      }
    } catch (relocationError) {
      catchFailures.push(errorMessage(relocationError));
    }
    addValidationCheck(report, "production-config", "Production config could not be loaded", [
      ...catchFailures,
    ]);
    return finish(report);
  }

  await fs.mkdir(report.configuration.reportDir, { recursive: true });
  await validateResolvedProduction(report, options, args);
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
