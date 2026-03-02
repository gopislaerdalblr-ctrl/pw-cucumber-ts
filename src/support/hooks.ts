import {
  Before,
  After,
  BeforeStep,
  AfterStep,
  setDefaultTimeout,
  Status,
} from "@cucumber/cucumber";
import fs from "node:fs";
import path from "node:path";
import {
  chromium,
  firefox,
  webkit,
  Browser,
  BrowserContext,
  Page,
  type ConsoleMessage,
  type Request,
  type Response,
} from "playwright";
import {
  loadInstance,
  loadCourseConfig,
  loadSecretsForInstance,
} from "../config/runtime";
import { World } from "./world";
// 👇 NEW IMPORT ADDED HERE
import { pageFixture } from "./pageFixture";

// --- Constants & Type Definitions ---

const FIXED_VIEWPORT = { width: 1920, height: 1080 };
const ALLOWED_BROWSER_TYPES = new Set(["chromium", "firefox", "webkit"]);

const BROWSER_LAUNCHERS = {
  chromium: (headless: boolean) =>
    chromium.launch({
      headless,
      args: ["--start-maximized"],
    }),
  firefox: (headless: boolean) => firefox.launch({ headless }),
  webkit: (headless: boolean) => webkit.launch({ headless }),
} as const;

type SecretsInstanceKey = Parameters<typeof loadSecretsForInstance>[0];
type SecretsEnv = Parameters<typeof loadSecretsForInstance>[1];

type NetEntry = {
  type: "request" | "response" | "failed";
  ts: string;
  method?: string;
  url: string;
  status?: number;
  statusText?: string;
  resourceType?: string;
  errorText?: string;
  timingMs?: number;
};

setDefaultTimeout(120_000);

// --- Helper Functions ---

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function safeWriteRunMeta(meta: any) {
  const tmpDir = path.resolve("reports/_tmp");
  ensureDir(tmpDir);

  const metaFile = path.join(tmpDir, "run-meta.json");
  const tempFile = metaFile + ".tmp";
  try {
    fs.writeFileSync(tempFile, JSON.stringify(meta, null, 2), "utf-8");
    fs.renameSync(tempFile, metaFile);
  } catch {
    try {
      if (fs.existsSync(tempFile)) fs.rmSync(tempFile, { force: true });
    } catch {
      // ignore
    }
  }
}

function readRunMeta(): any | null {
  try {
    const metaFile = path.resolve("reports/_tmp/run-meta.json");
    if (!fs.existsSync(metaFile)) return null;
    return JSON.parse(fs.readFileSync(metaFile, "utf-8"));
  } catch {
    return null;
  }
}

function formatRunNameFromIso(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`;
}

function safeFilePart(s: string) {
  return s.replace(/[^a-z0-9-_]/gi, "_").slice(0, 140);
}

function toFileUrl(p: string) {
  return "file:///" + p.replace(/\\/g, "/");
}

function writeTextFile(fullPath: string, content: string) {
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content, "utf-8");
}

function tryCopyFile(src: string, dest: string) {
  try {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  } catch {
    // ignore
  }
}

function getInstanceKey(): string {
  return String(process.env.INSTANCE || "maurya")
    .trim()
    .toLowerCase();
}

function getViewportOptionsForBrowser(browserType: string) {
  return browserType === "chromium"
    ? { viewport: null }
    : { viewport: FIXED_VIEWPORT };
}

// --- Hooks ---

BeforeStep(function (this: World, { pickleStep }) {
  (this as any).lastStepText = pickleStep?.text || "";
});

AfterStep(async function (this: World, { result }) {
  if (!result || result.status !== Status.FAILED) return;
  if (!this.page) return;

  try {
    const tmpShotsDir = path.resolve("reports/_tmp/screenshots");
    ensureDir(tmpShotsDir);

    const scenarioName = (this as any)?.pickle?.name || "scenario";
    const safeScenario = safeFilePart(scenarioName);
    const safeStep = safeFilePart((this as any).lastStepText || "failed_step");

    const fileName = `${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}_${safeScenario}__${safeStep}.png`;
    const fullPath = path.join(tmpShotsDir, fileName);

    const buf = await this.page.screenshot({ path: fullPath, fullPage: true });
    await this.attach(buf, "image/png");
    await this.attach(`URL: ${this.page.url()}`, "text/plain");

    (this as any)._failedStepScreenshotCaptured = true;
  } catch (e) {
    await this.attach(
      `Failed to capture AfterStep screenshot: ${(e as Error).message}`,
      "text/plain",
    );
  }
});

Before(async function (this: World, scenario) {
  (this as any).pickle = scenario.pickle;
  (this as any)._failedStepScreenshotCaptured = false;

  const instanceKey = getInstanceKey();
  const cfg = loadInstance(instanceKey);
  this.instance = cfg;

  const secrets = loadSecretsForInstance(
    instanceKey as SecretsInstanceKey,
    cfg.env as SecretsEnv,
  );

  const course = loadCourseConfig();
  // ✅ Save course config to World so After hook can access it
  (this as any).courseConfig = course;

  this.adminEmail = secrets.adminEmail;
  this.adminPassword = secrets.adminPassword;

  // --- BROWSER LAUNCH LOGIC ---
  const browserEnvValue = process.env.BROWSER;
  const browserType = browserEnvValue
    ? browserEnvValue.toLowerCase()
    : "chromium";
  const headless = process.env.HEADLESS === "true";

  if (!ALLOWED_BROWSER_TYPES.has(browserType)) {
    throw new Error(
      `Unsupported browser type "${browserEnvValue}". Allowed values are: chromium, firefox, webkit.`,
    );
  }

  const launchBrowser =
    BROWSER_LAUNCHERS[browserType as keyof typeof BROWSER_LAUNCHERS];

  const browser: Browser = await launchBrowser(headless);
  const contextOptions = getViewportOptionsForBrowser(browserType);

  // ✅ ENABLE VIDEO RECORDING
  const context: BrowserContext = await browser.newContext({
    ...contextOptions,
    recordVideo: {
      dir: path.resolve("reports/_tmp/videos"), // Temporary storage
      size: { width: 1280, height: 720 },
    },
  });
  const page: Page = await context.newPage();

  this.browser = browser;
  this.context = context;
  this.page = page;

  // 👇 NEW ASSIGNMENT ADDED HERE
  // This makes the page available to your steps (like the accessibility test)
  pageFixture.page = page;

  // -------------------------------------------------------------------------
  // ✅ SMART CONSOLE LOGGING (Truncate huge logs)
  // -------------------------------------------------------------------------
  this.consoleLogs = [];
  this.page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    // Truncate excessively long logs (e.g., >1000 chars) to prevent massive reports
    const limit = 1000;
    const cleanText =
      text.length > limit
        ? text.substring(0, limit) +
          ` ... [TRUNCATED (${text.length - limit} chars)]`
        : text;

    this.consoleLogs.push(`[console] ${msg.type()} ${cleanText}`);
  });
  // -------------------------------------------------------------------------

  (this as any).pageErrors = [];
  this.page.on("pageerror", (err: Error) => {
    (this as any).pageErrors.push(`[pageerror] ${err?.message || String(err)}`);
  });

  (this as any).netLogs = [] as NetEntry[];
  (this as any).reqStart = new Map<string, number>();

  const nowIso = () => new Date().toISOString();

  this.page.on("request", (req: Request) => {
    const id = req.url() + "::" + req.method() + "::" + req.resourceType();
    (this as any).reqStart.set(id, Date.now());
    (this as any).netLogs.push({
      type: "request",
      ts: nowIso(),
      method: req.method(),
      url: req.url(),
      resourceType: req.resourceType(),
    });
  });

  this.page.on("response", async (res: Response) => {
    const req = res.request();
    const id = req.url() + "::" + req.method() + "::" + req.resourceType();
    const start = (this as any).reqStart.get(id);
    const timingMs = typeof start === "number" ? Date.now() - start : undefined;
    (this as any).netLogs.push({
      type: "response",
      ts: nowIso(),
      method: req.method(),
      url: req.url(),
      status: res.status(),
      statusText: res.statusText(),
      resourceType: req.resourceType(),
      timingMs,
    });
  });

  this.page.on("requestfailed", (req: Request) => {
    (this as any).netLogs.push({
      type: "failed",
      ts: nowIso(),
      method: req.method(),
      url: req.url(),
      resourceType: req.resourceType(),
      errorText: req.failure()?.errorText || "requestfailed",
    });
  });

  // Persist run metadata
  safeWriteRunMeta({
    instance: instanceKey,
    env: this.instance.env,
    baseUrl: this.instance.baseUrl,
    subdomain: this.instance.subdomain,
    orgId: this.instance.orgId,
    courseName: course.courseName,
    sourceId: (this as any).sourceId ?? "not-captured-yet",
    generatedAt: new Date().toISOString(),
    browser: browserType,
    userSpecifiedBrowser:
      typeof process.env.BROWSER === "string" ? process.env.BROWSER : null,
  });

  await this.attach(`Scenario: ${scenario.pickle.name}`, "text/plain");
});

After(async function (this: World, scenario) {
  const scenarioName = scenario.pickle.name;

  // 1. Capture Screenshot on Failure (Must happen before close)
  if (scenario.result?.status === Status.FAILED && this.page) {
    const alreadyCaptured = Boolean(
      (this as any)._failedStepScreenshotCaptured,
    );
    if (!alreadyCaptured) {
      const tmpShotsDir = path.resolve("reports/_tmp/screenshots");
      ensureDir(tmpShotsDir);
      const safeName = safeFilePart(scenarioName);
      const fileName = `${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}_${safeName}.png`;
      const fullPath = path.join(tmpShotsDir, fileName);
      await this.page.screenshot({ path: fullPath, fullPage: true });
      const buf = fs.readFileSync(fullPath);
      await this.attach(buf, "image/png");
      await this.attach(`URL: ${this.page.url()}`, "text/plain");
    }

    // =========================================================================
    // ✅ GLOBAL UI ERROR CAPTURE (Auto-detect 502, 404, Alerts)
    // =========================================================================
    try {
      const detectedErrors = await this.page.evaluate(() => {
        const errors: string[] = [];

        // 1. Check Headers (H1) for common HTTP error codes/text
        const h1s = document.querySelectorAll("h1");
        h1s.forEach((h) => {
          const txt = h.innerText || "";
          if (/502|500|404|403|Bad Gateway|Internal Server Error/i.test(txt)) {
            errors.push(`Header Error: ${txt}`);
          }
        });

        // 2. Check for UI Toasts / Alerts / Error Banners
        const alerts = document.querySelectorAll(
          '.toast-message, .alert, div[role="alert"], .error-banner',
        );
        alerts.forEach((el) => {
          // Only capture if text is reasonably short (avoid capturing full body)
          const txt = (el as HTMLElement).innerText || "";
          if (txt.length > 0 && txt.length < 300) {
            errors.push(`UI Alert: ${txt}`);
          }
        });

        // 3. Fallback: Check body text for critical specific phrases
        const bodyText = document.body.innerText || "";
        if (bodyText.includes("502 Bad Gateway"))
          errors.push("Page contains: 502 Bad Gateway");
        if (bodyText.includes("404 Not Found"))
          errors.push("Page contains: 404 Not Found");

        return errors;
      });

      if (detectedErrors.length > 0) {
        const uniqueErrors = Array.from(new Set(detectedErrors));
        // Remove duplicates
        const errorMsg = `🚨 UI ERROR DETECTED ON FAILURE:\n${uniqueErrors.join("\n")}`;
        await this.attach(errorMsg, "text/plain");
        console.error(`\n[HOOKS] ${errorMsg}\n`); // Also print to local terminal
      }
    } catch (err) {
      // Ignore scraper errors (don't fail the test because scraper failed)
    }
    // =========================================================================
  }

  // =========================================================================
  // ✅ METADATA EXTRACTION (Robust OrgID & Course Logic)
  // =========================================================================
  const currentInstance = (this as any).instance || {};
  const courseConfig = (this as any).courseConfig || {};

  // A. Robust Org ID
  let activeOrgId = currentInstance.orgId || "unknown";

  if (this.page) {
    try {
      const url = this.page.url();
      const match = url.match(/\/manage_organization\/(\d+)/);
      if (match && match[1]) {
        activeOrgId = match[1];
      } else {
        const netLogs: NetEntry[] = (this as any).netLogs || [];
        const lastOrgVisit = netLogs
          .reverse()
          .find(
            (l) =>
              l.url.includes("/manage_organization/") &&
              !l.url.endsWith("/manage_organization/"),
          );
        if (lastOrgVisit) {
          const histMatch = lastOrgVisit.url.match(
            /\/manage_organization\/(\d+)/,
          );
          if (histMatch && histMatch[1]) {
            activeOrgId = histMatch[1];
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // B. Mapped Courses
  const foundCourses = new Set<string>();
  try {
    const steps = scenario.pickle.steps || [];
    steps.forEach((step) => {
      const text = step.text || "";
      const matches = text.match(/["']([^"']+)["']/g);
      if (matches) {
        matches.forEach((m) => {
          const key = m.replace(/["']/g, "");
          if (courseConfig[key]) {
            foundCourses.add(courseConfig[key]);
          } else if (Object.values(courseConfig).includes(key)) {
            foundCourses.add(key);
          }
        });
      }
    });
  } catch {
    // ignore
  }

  const coursesList = foundCourses.size
    ? Array.from(foundCourses)
        .map((c) => `• ${c}`)
        .join("\n" + " ".repeat(18)) // Indent items
    : "• (No mapped courses found)";

  const instanceKey = getInstanceKey();

  // ✅ PRETTIFIED METADATA BLOCK
  const testMetadata = `
╔════════════════════════════════════════════════════════════╗
║             🔍  TEST EXECUTION CONTEXT                     ║
╠════════════════════════════════════════════════════════════╣
║ 🌍 Environment    : ${(currentInstance.env || "unknown").toUpperCase().padEnd(30)} ║
║ 🔑 Instance Key   : ${instanceKey.padEnd(30)} ║
║ 🖥️  Browser        : ${(process.env.BROWSER || "chromium").padEnd(30)} ║
║ 🏢 Active Org ID  : ${activeOrgId.padEnd(30)} ║
║ 🔗 Base URL       : ${currentInstance.baseUrl || "unknown"}
╠════════════════════════════════════════════════════════════╣
║ 📚 Used Courses   :
                ${coursesList}
╚════════════════════════════════════════════════════════════╝
Timestamp: ${new Date().toISOString()}
`.trim();
  await this.attach(testMetadata, "text/plain");

  // =========================================================================
  // ✅ VIDEO & LOGS SAVING
  // =========================================================================

  // 1. Get Video Object Reference (BEFORE closing context)
  const video = this.page?.video ? this.page.video() : null;
  let videoPathPromise: Promise<string> | null = null;
  if (video) {
    videoPathPromise = video.path();
  }

  // 2. Generate Logs (Safe while page is closing)
  const meta = readRunMeta();
  const runName = meta?.generatedAt
    ? formatRunNameFromIso(meta.generatedAt)
    : formatRunNameFromIso(new Date().toISOString());

  const tmpLogsDir = path.resolve("reports/_tmp/logs");
  ensureDir(tmpLogsDir);

  const safeScenario = safeFilePart(scenarioName);
  const baseFile = `${runName}__${safeScenario}`;

  const consoleFileTmp = path.join(tmpLogsDir, `${baseFile}__console.log`);
  const pageErrFileTmp = path.join(tmpLogsDir, `${baseFile}__pageerrors.log`);
  const netFileTmp = path.join(tmpLogsDir, `${baseFile}__network.log`);
  const netJsonFileTmp = path.join(tmpLogsDir, `${baseFile}__network.json`);

  const consoleText = this.consoleLogs?.length
    ? this.consoleLogs.join("\n")
    : "No console logs captured.";
  writeTextFile(consoleFileTmp, consoleText);

  const pageErrors: string[] = (this as any).pageErrors || [];
  const pageErrorsText = pageErrors.length
    ? pageErrors.join("\n")
    : "No page errors captured.";
  writeTextFile(pageErrFileTmp, pageErrorsText);

  const netLogs: NetEntry[] = (this as any).netLogs || [];
  let netText = "No network logs captured.";
  if (netLogs.length) {
    const lines: string[] = [];
    lines.push("========== NETWORK LOGS ==========");
    for (const e of netLogs) {
      if (e.type === "request") {
        lines.push(
          `[${e.ts}] [REQ] ${e.method} ${e.url} (${e.resourceType || ""})`,
        );
      } else if (e.type === "response") {
        lines.push(
          `[${e.ts}] [RES] ${e.method} ${e.url} -> ${e.status} ${e.statusText || ""} (${e.resourceType || ""}) ${typeof e.timingMs === "number" ? `(${e.timingMs}ms)` : ""}`,
        );
      } else {
        lines.push(
          `[${e.ts}] [FAIL] ${e.method} ${e.url} (${e.resourceType || ""}) :: ${e.errorText || ""}`,
        );
      }
    }
    lines.push("==================================");
    netText = lines.join("\n");
  }
  writeTextFile(netFileTmp, netText);
  writeTextFile(netJsonFileTmp, JSON.stringify(netLogs, null, 2));

  // 3. CLOSE BROWSER CONTEXT (Vital for saving Video)
  await this.page?.close().catch(() => {});
  await this.context?.close().catch(() => {});
  await this.browser?.close().catch(() => {});

  // 4. PROCESS VIDEO (Now that context is closed, file is fully written)
  if (video && videoPathPromise) {
    try {
      const originalPath = await videoPathPromise;
      if (fs.existsSync(originalPath)) {
        const videosDir = path.resolve("reports/_tmp/videos");
        ensureDir(videosDir);
        const newFileName = `${runName}__${safeFilePart(scenarioName)}.webm`;
        const newPath = path.join(videosDir, newFileName);

        try {
          if (fs.existsSync(newPath)) fs.rmSync(newPath, { force: true });
          fs.renameSync(originalPath, newPath);
        } catch (e) {
          fs.copyFileSync(originalPath, newPath);
          fs.unlinkSync(originalPath);
        }
        const videoBuf = fs.readFileSync(newPath);
        await this.attach(videoBuf, "video/webm");
        // Prettified Video Label
        await this.attach(`🎥 Video: ${newFileName}`, "text/plain");
      }
    } catch (e) {
      await this.attach(
        `⚠️ Video processing failed: ${(e as Error).message}`,
        "text/plain",
      );
    }
  }

  // 5. Prettified Summary Text Attachment
  const summary: string[] = [];
  summary.push("📋 LOG FILES (Available locally)");
  summary.push("────────────────────────────────────────────────");
  summary.push(`📂 Run ID: ${runName}`);
  summary.push("");
  summary.push("🔗 Open Local Logs:");
  summary.push(`  • Console    : ${toFileUrl(consoleFileTmp)}`);
  summary.push(`  • PageErrors : ${toFileUrl(pageErrFileTmp)}`);
  summary.push(`  • Network    : ${toFileUrl(netFileTmp)}`);
  summary.push(`  • NetworkJS  : ${toFileUrl(netJsonFileTmp)}`);
  summary.push("");
  summary.push("📝 Local Paths:");
  summary.push(`  • ${consoleFileTmp}`);
  summary.push("────────────────────────────────────────────────");

  await this.attach(summary.join("\n"), "text/plain");

  if (this.heal?.enabled) {
    await this.attach(`Healwright enabled: ${this.heal.enabled}`, "text/plain");
  }
  if (this.heal?.used) {
    const msg = `Failed scenario had a selector/locator issue, it was healed with Healwright.`;
    await this.attach(msg, "text/plain");
    if (Array.isArray(this.heal.messages) && this.heal.messages.length) {
      await this.attach(this.heal.messages.join("\n"), "text/plain");
    }
  }
});
