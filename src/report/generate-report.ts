import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import reporter from "cucumber-html-reporter";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(
    d.getHours(),
  )}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function readRunMeta(): any {
  const metaPath = path.resolve("reports/_tmp/run-meta.json");
  try {
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    }
  } catch {
    // ignore
  }
  return {};
}

// 👇 NEW HELPER FUNCTION
function copyFolderSync(from: string, to: string) {
  if (!fs.existsSync(from)) return;
  if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });

  fs.readdirSync(from).forEach((element) => {
    const stat = fs.lstatSync(path.join(from, element));
    if (stat.isFile()) {
      fs.copyFileSync(path.join(from, element), path.join(to, element));
    } else if (stat.isDirectory()) {
      copyFolderSync(path.join(from, element), path.join(to, element));
    }
  });
}

async function zipFolder(srcDir: string, zipFile: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipFile);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

async function generateReport() {
  const tmpJson = path.resolve("reports/_tmp/cucumber.json");
  if (!fs.existsSync(tmpJson)) {
    throw new Error("Missing cucumber.json. Run tests first.");
  }

  const meta = readRunMeta();

  const runFolder = path.resolve("reports/_history", stamp());
  fs.mkdirSync(runFolder, { recursive: true });

  // 1. Copy cucumber.json + screenshots + run-meta.json into history bundle
  fs.cpSync("reports/_tmp", path.join(runFolder, "_tmp"), { recursive: true });

  // 2. 👇 COPY ACCESSIBILITY REPORTS (The new logic)
  const accessSrc = path.resolve("reports/_tmp/accessibility");
  const accessDest = path.join(runFolder, "accessibility");
  if (fs.existsSync(accessSrc)) {
    copyFolderSync(accessSrc, accessDest);
    console.log(`📦 Accessibility reports archived to: ${accessDest}`);
  }

  const htmlPath = path.join(runFolder, "report.html");

  // 3. Generate the HTML Report
  // (We use the object literal directly here to avoid the 'options' error)
  reporter.generate({
    theme: "bootstrap",
    jsonFile: tmpJson,
    output: htmlPath,
    reportSuiteAsScenarios: true,
    scenarioTimestamp: true,
    launchReport: false,
    metadata: {
      Browser: process.env.BROWSER || "unknown",
      Instance: meta.instance || process.env.INSTANCE || "unknown",
      Env: meta.env || "unknown",
      BaseURL: meta.baseUrl || "unknown",
      Subdomain: meta.subdomain || "unknown",
      OrgId: meta.orgId || "unknown",
      Course: meta.courseName || "unknown",
    },
  });

  // Guard: if report.html was not created, don't crash
  if (!fs.existsSync(htmlPath)) {
    console.warn(
      `report.html not found at ${htmlPath}. Skipping theme injection + zip.`,
    );
    return;
  }

  // ---------- LAYOUT + COLOR THEME ----------
  const html = fs.readFileSync(htmlPath, "utf-8");

  const css = `
<style>
  .container { width: 98% !important; max-width: 98% !important; }
  table { width: 100% !important; }

  .row { margin-left: 0 !important; margin-right: 0 !important; }
  [class*="col-"] { padding-left: 8px !important; padding-right: 8px !important; }

  .col-xs-1, .col-xs-2, .col-xs-3, .col-xs-4, .col-xs-5, .col-xs-6, .col-xs-7, .col-xs-8, .col-xs-9, .col-xs-10, .col-xs-11, .col-xs-12,
  .col-sm-1, .col-sm-2, .col-sm-3, .col-sm-4, .col-sm-5, .col-sm-6, .col-sm-7, .col-sm-8, .col-sm-9, .col-sm-10, .col-sm-11, .col-sm-12,
  .col-md-1, .col-md-2, .col-md-3, .col-md-4, .col-md-5, .col-md-6, .col-md-7, .col-md-8, .col-md-9, .col-md-10, .col-md-11, .col-md-12,
  .col-lg-1, .col-lg-2, .col-lg-3, .col-lg-4, .col-lg-5, .col-lg-6, .col-lg-7, .col-lg-8, .col-lg-9, .col-lg-10, .col-lg-11, .col-lg-12 {
    float: none !important;
    width: 100% !important;
    max-width: 100% !important;
    margin-left: 0 !important;
  }

  .panel, .panel-body, .well {
    width: 100% !important;
    max-width: 100% !important;
  }

  body {
    background: linear-gradient(135deg, #f6f8ff 0%, #f2fbff 40%, #f7fff6 100%) !important;
  }

  .navbar, .navbar-default, .page-header {
    background: linear-gradient(90deg, #3b82f6 0%, #22c55e 50%, #ef4444 100%) !important;
    border: none !important;
    color: #fff !important;
  }
  .navbar *, .page-header * { color: #fff !important; }

  h1, h2, h3, h4 { color: #0f172a !important; }

  .panel, .well, .breadcrumb, .list-group-item {
    border: 1px solid rgba(2, 6, 23, 0.08) !important;
    border-radius: 14px !important;
    box-shadow: 0 10px 25px rgba(2, 6, 23, 0.06) !important;
    background: rgba(255,255,255,0.92) !important;
  }
  .panel-heading {
    border-top-left-radius: 14px !important;
    border-top-right-radius: 14px !important;
    background: linear-gradient(90deg, rgba(59,130,246,0.12), rgba(34,197,94,0.10), rgba(239,68,68,0.10)) !important;
    border-bottom: 1px solid rgba(2, 6, 23, 0.06) !important;
  }

  a, a:hover, a:focus { color: #2563eb !important; }

  .label, .badge {
    border-radius: 999px !important;
    padding: 6px 10px !important;
    font-weight: 700 !important;
  }
  .label-success, .badge-success { background: #16a34a !important; }
  .label-danger, .badge-danger { background: #dc2626 !important; }
  .label-warning, .badge-warning { background: #f59e0b !important; color: #111827 !important; }
  .label-info, .badge-info { background: #0ea5e9 !important; }

  .list-group-item { margin-bottom: 8px !important; }
</style>
`;

  if (html.includes("</head>")) {
    fs.writeFileSync(
      htmlPath,
      html.replace("</head>", `${css}\n</head>`),
      "utf-8",
    );
  }
  // ---------- END THEME ----------

  // Create zip outside runFolder (so zip won't include itself)
  const historyRoot = path.resolve("reports/_history");
  const zipPath = path.join(historyRoot, `${path.basename(runFolder)}.zip`);
  await zipFolder(runFolder, zipPath);

  // Also keep a copy inside the run folder for easy share
  const zipInRunFolder = path.join(runFolder, "report.zip");
  try {
    fs.copyFileSync(zipPath, zipInRunFolder);
  } catch {
    // ignore
  }

  console.log("HTML Report:", htmlPath);
  console.log("ZIP Report :", zipPath);
}

// Run only when executed directly (NOT when cucumber loads step files)
if (require.main === module) {
  generateReport().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { generateReport };
