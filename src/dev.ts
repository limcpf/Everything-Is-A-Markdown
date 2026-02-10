import path from "node:path";
import chokidar from "chokidar";
import type { BuildOptions } from "./types";
import { buildSite } from "./build";
import { buildExcluder } from "./utils";

interface DevOptions {
  port: number;
}

function isStaticPathMatch(relPath: string, staticPath: string): boolean {
  return relPath === staticPath || relPath.startsWith(`${staticPath}/`);
}

async function resolveOutputFile(outDir: string, pathname: string): Promise<string | null> {
  const decoded = decodeURIComponent(pathname);
  const clean = decoded.replace(/^\/+/, "");
  if (clean.includes("..")) {
    return null;
  }

  if (decoded === "/") {
    return path.join(outDir, "index.html");
  }

  const directFile = path.join(outDir, clean);
  if (await Bun.file(directFile).exists()) {
    return directFile;
  }

  if (decoded.endsWith("/")) {
    const withIndex = path.join(outDir, clean, "index.html");
    if (await Bun.file(withIndex).exists()) {
      return withIndex;
    }
  }

  const routeIndex = path.join(outDir, clean, "index.html");
  if (await Bun.file(routeIndex).exists()) {
    return routeIndex;
  }

  return path.join(outDir, "404.html");
}

export async function runDev(options: BuildOptions, devOptions: DevOptions): Promise<void> {
  const isExcluded = buildExcluder(options.exclude);
  let runningBuild = false;
  let queuedBuild = false;

  const buildOnce = async () => {
    if (runningBuild) {
      queuedBuild = true;
      return;
    }

    runningBuild = true;
    try {
      const result = await buildSite(options);
      console.log(`[build] total=${result.totalDocs} rendered=${result.renderedDocs} skipped=${result.skippedDocs}`);
    } catch (error) {
      console.error("[build] failed", error);
    } finally {
      runningBuild = false;
      if (queuedBuild) {
        queuedBuild = false;
        await buildOnce();
      }
    }
  };

  await buildOnce();

  const watcher = chokidar.watch(options.vaultDir, {
    ignoreInitial: true,
    ignored: (targetPath: string, stats?: { isDirectory(): boolean }) => {
      const relPath = path.relative(options.vaultDir, targetPath).split(path.sep).join("/");
      if (!relPath || relPath.startsWith("..")) {
        return false;
      }
      return isExcluded(relPath, stats?.isDirectory() ?? false);
    },
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRebuild = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void buildOnce();
    }, 250);
  };

  watcher.on("all", (_event, changedPath) => {
    const relPath = path.relative(options.vaultDir, changedPath).split(path.sep).join("/");
    if (!relPath || relPath.startsWith("..")) {
      return;
    }

    const isMarkdownChange = /\.md$/i.test(changedPath);
    const isStaticChange = options.staticPaths.some((staticPath) => isStaticPathMatch(relPath, staticPath));
    if (!isMarkdownChange && !isStaticChange) {
      return;
    }
    scheduleRebuild();
  });

  const server = Bun.serve({
    port: devOptions.port,
    async fetch(request) {
      const url = new URL(request.url);
      const filePath = await resolveOutputFile(options.outDir, url.pathname);
      if (!filePath) {
        return new Response("Forbidden", { status: 403 });
      }
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(file);
    },
  });

  console.log(`[dev] http://localhost:${server.port}`);

  const shutdown = async () => {
    await watcher.close();
    server.stop(true);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  await new Promise(() => {
    // Keep process alive until signal.
  });
}
