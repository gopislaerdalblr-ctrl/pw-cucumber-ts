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
import type { ConsoleMessage, Request, Response } from "playwright";
import {
  loadInstance,
  loadCourseConfig,
  loadSecretsForInstance,
} from "../config/runtime";
import { launchPlaywright } from "./playwright-manager";
import { World } from "./world";

setDefaultTimeout(120_000);

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

// normalize INSTANCE input once, same everywhere
function getInstanceKey(): string {
  return String(process.env.INSTANCE || "maurya")
    .trim()
    .toLowerCase();
}

/**
 * ✅ Capture screenshot at the exact failed step moment
 */
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

  // ✅ SINGLE source of truth for instance
  const instanceKey = getInstanceKey();

  // ✅ Load instance config once
  const cfg = loadInstance(instanceKey);
  this.instance = cfg;

  // ✅ Load secrets based on instance (qa-samurai.json / qaSamurai.json etc)
  // NOTE: some projects type these params narrowly; cast only at the boundary to avoid TS EnvName complaints.
  const secrets = loadSecretsForInstance(instanceKey as any, cfg.env as any);

  const course = loadCourseConfig();

  this.adminEmail = secrets.adminEmail;
  this.adminPassword = secrets.adminPassword;

  const pw = await launchPlaywright();
  this.browser = pw.browser;
  this.context = pw.context;
  this.page = pw.page;

  // Console logs
  this.consoleLogs = [];
  this.page.on("console", (msg: ConsoleMessage) => {
    this.consoleLogs.push(`[console] ${msg.type()} ${msg.text()}`);
  });

  // Page errors
  (this as any).pageErrors = [];
  this.page.on("pageerror", (err: Error) => {
    (this as any).pageErrors.push(`[pageerror] ${err?.message || String(err)}`);
  });

  // Network logs
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
    browser: process.env.BROWSER || "chromium",
  });

  await this.attach(`Scenario: ${scenario.pickle.name}`, "text/plain");
});

After(async function (this: World, scenario) {
  const scenarioName = scenario.pickle.name;

  // ✅ Guard: if Before failed, page/context/browser may be undefined
  const video = this.page?.video ? this.page.video() : null;

  // Screenshot on failure (only if page exists)
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
  }

  // Write logs (safe even if page was never created)
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
          `[${e.ts}] [RES] ${e.method} ${e.url} -> ${e.status} ${
            e.statusText || ""
          } (${e.resourceType || ""}) ${
            typeof e.timingMs === "number" ? `(${e.timingMs}ms)` : ""
          }`,
        );
      } else {
        lines.push(
          `[${e.ts}] [FAIL] ${e.method} ${e.url} (${e.resourceType || ""}) :: ${
            e.errorText || ""
          }`,
        );
      }
    }
    lines.push("==================================");
    netText = lines.join("\n");
  }
  writeTextFile(netFileTmp, netText);
  writeTextFile(netJsonFileTmp, JSON.stringify(netLogs, null, 2));

  const historyRunDir = path.resolve("reports/_history", runName);
  const artifactsDir = path.join(historyRunDir, "artifacts");

  if (fs.existsSync(historyRunDir)) {
    tryCopyFile(
      consoleFileTmp,
      path.join(artifactsDir, path.basename(consoleFileTmp)),
    );
    tryCopyFile(
      pageErrFileTmp,
      path.join(artifactsDir, path.basename(pageErrFileTmp)),
    );
    tryCopyFile(netFileTmp, path.join(artifactsDir, path.basename(netFileTmp)));
    tryCopyFile(
      netJsonFileTmp,
      path.join(artifactsDir, path.basename(netJsonFileTmp)),
    );
  }

  const summary: string[] = [];
  summary.push("✅ Logs saved as files (not embedded) to keep report small:");
  summary.push(`Run: ${runName}`);
  summary.push("");
  summary.push("TMP Paths (always available):");
  summary.push(`- Console   : ${consoleFileTmp}`);
  summary.push(`- PageErrors: ${pageErrFileTmp}`);
  summary.push(`- Network   : ${netFileTmp}`);
  summary.push(`- NetworkJS : ${netJsonFileTmp}`);
  summary.push("");
  summary.push("Open directly (local):");
  summary.push(`- Console   : ${toFileUrl(consoleFileTmp)}`);
  summary.push(`- PageErrors: ${toFileUrl(pageErrFileTmp)}`);
  summary.push(`- Network   : ${toFileUrl(netFileTmp)}`);
  summary.push(`- NetworkJS : ${toFileUrl(netJsonFileTmp)}`);
  if (fs.existsSync(historyRunDir)) {
    summary.push("");
    summary.push("Also copied into History (inside same run folder):");
    summary.push(`- ${artifactsDir}`);
  } else {
    summary.push("");
    summary.push(
      "Note: History folder may be created after execution when report is generated. Logs are safely stored in reports/_tmp/logs now.",
    );
  }
  await this.attach(summary.join("\n"), "text/plain");

  // ✅ Healwright attachments should NOT depend on video existing
  if (this.heal?.enabled) {
    await this.attach(`Healwright enabled: ${this.heal.enabled}`, "text/plain");
  }
  if (this.heal?.used) {
    const msg =
      `Failed scenario had a selector/locator issue, it was healed with Healwright, ` +
      `the scenario was retried once (if retry enabled), and then it passed (or continued).`;
    await this.attach(msg, "text/plain");

    if (Array.isArray(this.heal.messages) && this.heal.messages.length) {
      await this.attach(this.heal.messages.join("\n"), "text/plain");
    }
  }

  // wait a bit so video isn't cut
  await this.page?.waitForTimeout(3000).catch(() => {});

  // close safely
  await this.page?.close().catch(() => {});
  await this.context?.close().catch(() => {});
  await this.browser?.close().catch(() => {});

  // attach video (only if available)
  if (video) {
    try {
      const originalPath = await video.path();
      const finalOriginalPath =
        typeof originalPath === "string" ? originalPath : await video.path();

      for (let i = 0; i < 30; i++) {
        if (fs.existsSync(finalOriginalPath)) break;
        await new Promise((r) => setTimeout(r, 200));
      }

      if (fs.existsSync(finalOriginalPath)) {
        const meta2 = readRunMeta();
        const runName2 = meta2?.generatedAt
          ? formatRunNameFromIso(meta2.generatedAt)
          : formatRunNameFromIso(new Date().toISOString());

        const videosDir = path.resolve("reports/_tmp/videos");
        ensureDir(videosDir);

        const newFileName = `${runName2}__${safeFilePart(scenarioName)}.webm`;
        const newPath = path.join(videosDir, newFileName);

        try {
          if (fs.existsSync(newPath)) fs.rmSync(newPath, { force: true });
        } catch {
          // ignore
        }

        fs.renameSync(finalOriginalPath, newPath);

        const videoBuf = fs.readFileSync(newPath);
        await this.attach(videoBuf, "video/webm");
        await this.attach(`Video: ${newFileName}`, "text/plain");
      }
    } catch {
      // ignore
    }
  }
});
