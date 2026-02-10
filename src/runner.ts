import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

/**
 * Simple runner (single entry point)
 * - Change defaults in RUN_CONFIG only
 * - Supports parallel safely (per-worker json + merge)
 * - Generates report + zip automatically after run
 */
const RUN_CONFIG = {
  // Change these defaults whenever you want
  instance: "qa-samurai", // instance key from src/config/instances.json
  //tags: "@test or @regression",
  tags: "@test",
  parallel: 4,

  // NOTE:
  // If you set browser to "chromium" + "firefox" + "webkit",
  // TypeScript concatenates it into "chromiumfirefoxwebkit".
  // This runner now detects that and runs all 3 browsers.
  //browser: "chromium" + "firefox" + "webkit", // chromium | firefox | webkit | "all" | "chromium+firefox+webkit"
  // browser: "all",
  browser: "chromium",
  headless: false,

  // Toggle this to control dry run
  dryRun: false,

  // How many reports to keep in reports/_history
  keepLastReports: 5,
} as const;

function envOrDefault(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : fallback;
}

function parseBool(v: string, fallback: boolean): boolean {
  const s = (v ?? "").toLowerCase();
  if (s === "true") return true;
  if (s === "false") return false;
  return fallback;
}

function parseIntSafe(v: string, fallback: number): number {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Convert browser config into a list of browsers to run.
 * Supports:
 * - "chromium"
 * - "firefox"
 * - "webkit"
 * - "all"
 * - "chromium+firefox+webkit"
 * - "chromium,firefox,webkit"
 * - the accidental concatenation: "chromiumfirefoxwebkit"
 */
function parseBrowsers(input: string): string[] {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return ["chromium"];

  // Handle the exact issue you hit: "chromium" + "firefox" + "webkit"
  // becomes this string
  if (raw === "chromiumfirefoxwebkit") return ["chromium", "firefox", "webkit"];

  if (raw === "all") return ["chromium", "firefox", "webkit"];

  const parts = raw.includes("+")
    ? raw.split("+")
    : raw.includes(",")
      ? raw.split(",")
      : raw.includes(" ")
        ? raw.split(/\s+/)
        : [raw];

  const cleaned = parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p === "chrome" ? "chromium" : p));

  // Keep only known values and preserve order, remove duplicates
  const valid = ["chromium", "firefox", "webkit"];
  const out: string[] = [];
  for (const b of cleaned) {
    if (valid.includes(b) && !out.includes(b)) out.push(b);
  }

  return out.length ? out : ["chromium"];
}

const instance = envOrDefault("INSTANCE", RUN_CONFIG.instance).toLowerCase();
const tags = envOrDefault("TAGS", RUN_CONFIG.tags);
const parallel = parseIntSafe(
  envOrDefault("PARALLEL", String(RUN_CONFIG.parallel)),
  RUN_CONFIG.parallel,
);

// If env BROWSER is provided, use it; otherwise use RUN_CONFIG.browser
const browserRaw = envOrDefault("BROWSER", RUN_CONFIG.browser).toLowerCase();
const browsersToRun = parseBrowsers(browserRaw);

const headless = parseBool(
  envOrDefault("HEADLESS", String(RUN_CONFIG.headless)),
  RUN_CONFIG.headless,
);

// Keep your behavior: dryRun controlled only via RUN_CONFIG
const DRY_RUN = RUN_CONFIG.dryRun;

function runTs(scriptPath: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["-r", "ts-node/register", scriptPath],
      { stdio: "inherit", env },
    );
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function mergeWorkerJsonToSingle(): string | null {
  const tmpDir = path.resolve("reports", "_tmp");
  if (!fs.existsSync(tmpDir)) return null;

  const workerFiles = fs
    .readdirSync(tmpDir)
    .filter((f) => /^cucumber-worker-\d+\.json$/i.test(f))
    .map((f) => path.join(tmpDir, f));

  if (!workerFiles.length) return null;

  const merged: any[] = [];
  for (const file of workerFiles) {
    const raw = fs.readFileSync(file, "utf-8").trim();
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) merged.push(...parsed);
    else merged.push(parsed);
  }

  const outPath = path.join(tmpDir, "cucumber.json");
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), "utf-8");

  // Clean up worker files to keep _tmp tidy
  for (const f of workerFiles) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      // ignore
    }
  }

  return outPath;
}

async function runOnceForBrowser(browser: string): Promise<number> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    INSTANCE: instance,
    BROWSER: browser,
    HEADLESS: String(headless),
  };

  const cucumberEntry = path.resolve(
    "node_modules",
    "@cucumber",
    "cucumber",
    "bin",
    "cucumber-js",
  );

  if (!fs.existsSync(cucumberEntry)) {
    throw new Error(`Cucumber entry not found: ${cucumberEntry}`);
  }

  // Ensure folders exist
  fs.mkdirSync(path.resolve("reports", "_tmp"), { recursive: true });
  fs.mkdirSync(path.resolve("reports", "_history"), { recursive: true });

  // Run cucumber through node (Windows-safe)
  const args: string[] = [
    cucumberEntry,
    "--config",
    "cucumber.js",
    "--tags",
    tags,
    "--parallel",
    String(parallel),
  ];

  if (DRY_RUN) {
    args.push("--dry-run");
  }

  const exitCode: number = await new Promise((resolve) => {
    const p = spawn(process.execPath, args, { stdio: "inherit", env });
    p.on("exit", (code) => resolve(code ?? 1));
  });

  // Dry-run: skip report generation
  if (DRY_RUN) {
    return exitCode;
  }

  // Merge parallel outputs to a single cucumber.json
  const merged = mergeWorkerJsonToSingle();
  if (!merged) {
    return exitCode;
  }

  // Generate report once per browser run
  const gen = path.resolve("src", "report", "generate-report.ts");
  const rot = path.resolve("src", "report", "rotate-reports.ts");

  if (fs.existsSync(gen)) await runTs(gen, env);
  if (fs.existsSync(rot)) {
    // pass keepLast via env (simple, optional)
    env.REPORTS_KEEP_LAST = String(RUN_CONFIG.keepLastReports);
    await runTs(rot, env);
  }

  return exitCode;
}

async function main() {
  let finalExitCode = 0;

  // Run one full execution per browser
  for (const b of browsersToRun) {
    console.log(`\n==============================`);
    console.log(`🚀 Running on browser: ${b}`);
    console.log(`==============================\n`);

    const code = await runOnceForBrowser(b);
    if (code !== 0) finalExitCode = code; // keep non-zero if any browser fails
  }

  process.exit(finalExitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
