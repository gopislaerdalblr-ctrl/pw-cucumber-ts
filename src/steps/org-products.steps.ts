// src/steps/org-products.steps.ts
// Updated ONLY to fix the TypeScript errors you shared (arrays passed to locator, missing helpers, wrong selector key),
// without changing your already-working “Add course” flow logic.

import { Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { World } from "../support/world";
import { S } from "../ui/selectors";

/**
 * Helper: click first visible selector from a list (your project pattern)
 */
async function clickIfPresent(world: World, selectors: readonly string[]) {
  for (const sel of selectors) {
    const loc = world.page.locator(sel);
    const count = await loc.count().catch(() => 0);
    if (count > 0) {
      const isVisible = await loc
        .first()
        .isVisible()
        .catch(() => false);
      if (isVisible) {
        await loc
          .first()
          .click()
          .catch(() => {});
        return true;
      }
    }
  }
  return false;
}

/**
 * Helper: fill first visible selector from a list (your project pattern)
 */
async function fillIfPresent(
  world: World,
  selectors: readonly string[],
  value: string,
) {
  for (const sel of selectors) {
    const loc = world.page.locator(sel);
    const count = await loc.count().catch(() => 0);
    if (count > 0) {
      const isVisible = await loc
        .first()
        .isVisible()
        .catch(() => false);
      if (isVisible) {
        await loc
          .first()
          .fill(value)
          .catch(() => {});
        return true;
      }
    }
  }
  return false;
}

// ----------------------- Missing helpers (added) -----------------------
function ensureDir(dirPath: string) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

function deleteIfExists(p: string) {
  try {
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  } catch {
    // ignore
  }
}

function nowSuffix(maxLen = 20) {
  // millisecond suffix, short, numeric
  const s = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return s.slice(-maxLen);
}

function parseCsvHeader(csvText: string): string[] {
  // first non-empty line
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  // Basic CSV split for header (good enough for most templates: no commas inside quotes in header)
  // If header contains quotes, we still keep them handled lightly.
  return splitCsvLine(lines[0]).map((h) => h.replace(/^\uFEFF/, "").trim());
}

function normalizeHeader(h: string): string {
  return (h || "").toLowerCase().replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

function splitCsvLine(line: string): string[] {
  // Minimal CSV parser that supports quoted commas.
  const out: string[] = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // toggle, handle escaped ""
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function escapeCsvValue(v: string): string {
  const s = (v ?? "").toString();
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildRowByHeader(headers: string[], values: Record<string, string>) {
  // values keys are normalized headers; match against normalized template header
  return headers
    .map((h) => {
      const key = normalizeHeader(h);
      const val = values[key] ?? "";
      return escapeCsvValue(val);
    })
    .join(",");
}

async function tryGetFlashText(page: World["page"]): Promise<string> {
  const flash = page.locator(
    '.alert-success, .alert.alert-success, .flash-success, div:has-text("added successfully"), div:has-text("success")',
  );

  const visible = await flash
    .first()
    .isVisible({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  if (!visible) return "";
  return (
    await flash
      .first()
      .innerText()
      .catch(() => "")
  ).trim();
}
// ----------------------------------------------------------------------

type CourseConfig = {
  courseName: string;
  courseId: string;
  defaultTags?: string;
};

function readCourseConfig(): CourseConfig {
  const p = path.resolve("src/config/course.json");

  const raw = fs
    .readFileSync(p, "utf-8")
    .replace(/^\uFEFF/, "")
    .trim();

  try {
    return JSON.parse(raw) as CourseConfig;
  } catch (e) {
    throw new Error(
      `course.json is not valid JSON. File: ${p}\n` +
        `Tip: Ensure it contains ONLY JSON (no comments/trailing commas) and uses double quotes.\n` +
        `Original error: ${(e as Error).message}`,
    );
  }
}

Then(
  "Check if course is available or add the course as {string} and {string}",
  async function (this: World, courseArg1: string, courseArg2: string) {
    const courseCfg = readCourseConfig();

    const resolveCourse = (arg: string) => {
      const key = (arg || "").trim();

      const isCourseKey =
        /^courseid(\d+)?$/i.test(key) || key.toUpperCase() === "COURSEID";

      const defaultCourseId = String((courseCfg as any).courseId || "").trim();
      const defaultCourseName = String(
        (courseCfg as any).courseName || "",
      ).trim();

      let courseId = "";
      let courseName = "";

      if (!key || key.toUpperCase() === "COURSEID") {
        courseId = defaultCourseId;
        courseName = defaultCourseName;
      } else if (isCourseKey) {
        const resolvedCourseId = String(
          (courseCfg as any)[key] ??
            (courseCfg as any)[key.toLowerCase()] ??
            "",
        ).trim();

        const suffix = key.match(/^courseid(\d+)?$/i)?.[1] || "";
        const nameKey = `courseName${suffix}`;

        const resolvedCourseName = String(
          (courseCfg as any)[nameKey] ??
            (courseCfg as any)[nameKey.toLowerCase()] ??
            "",
        ).trim();

        courseId = resolvedCourseId || key;
        courseName = resolvedCourseName || defaultCourseName;
      } else {
        courseId = key;
        courseName = defaultCourseName;
      }

      if (!courseId) {
        throw new Error(
          `CourseId is empty. Step passed "${arg}". Check src/config/course.json.`,
        );
      }

      return { courseId, courseName };
    };

    const courses = [resolveCourse(courseArg1), resolveCourse(courseArg2)];

    // Products table scope
    const productsTable = this.page
      .locator('table:has(th:has-text("PRODUCT CODE"))')
      .first();
    await expect(productsTable).toBeVisible({ timeout: 15000 });

    // -------- Helpers for report --------
    const getEntriesInfoText = async (): Promise<string> => {
      const infoLoc = this.page
        .locator(".dataTables_info, div.dataTables_info, [id$='_info']")
        .first();

      const visible = await infoLoc
        .isVisible({ timeout: 2000 })
        .then(() => true)
        .catch(() => false);

      if (!visible) return "";
      return (await infoLoc.innerText().catch(() => "")).trim();
    };

    const getProductsTableSnapshot = async (): Promise<string> => {
      const table = this.page
        .locator('table:has(th:has-text("PRODUCT CODE"))')
        .first();

      const visible = await table
        .isVisible({ timeout: 3000 })
        .then(() => true)
        .catch(() => false);

      if (!visible) return "";
      return (await table.innerText().catch(() => "")).trim();
    };

    const attachCombinedReportBlock = async (
      title: string,
      flashText: string,
    ) => {
      const tableSnap = await getProductsTableSnapshot();
      const entriesInfo = await getEntriesInfoText();

      const lines: string[] = [];
      lines.push(`✅ ${title}`);
      lines.push("");

      if (flashText) {
        lines.push(`✅ Flash Message: ${flashText}`);
        lines.push("");
      }

      if (tableSnap) {
        lines.push("📋 PRODUCTS TABLE:");
        lines.push(tableSnap);
        lines.push("");
      }

      if (entriesInfo) {
        lines.push(`📌 Entries info: ${entriesInfo}`);
      }

      const finalText = lines.join("\n");
      await this.attach(finalText, "text/plain");
      console.log(finalText);
    };
    // -----------------------------------

    for (const { courseId, courseName } of courses) {
      const noRecords = await productsTable
        .locator("text=No records are available")
        .isVisible()
        .catch(() => false);

      let alreadyThere = false;

      if (!noRecords) {
        const tbody = productsTable.locator("tbody");
        const rowById = tbody.locator("tr", { hasText: courseId });
        const rowByName = tbody.locator("tr", { hasText: courseName });

        const hasById = (await rowById.count().catch(() => 0)) > 0;
        const hasByName = (await rowByName.count().catch(() => 0)) > 0;

        alreadyThere = hasById || hasByName;
      }

      if (alreadyThere) {
        await attachCombinedReportBlock(
          `Course already exists: ${courseId} (${courseName})`,
          "",
        );
        continue;
      }

      const addLinkClicked = await clickIfPresent(
        this,
        S.adminLogin.orgProducts.addProductLink,
      );
      if (!addLinkClicked) throw new Error("Add Product link not found.");

      await this.page.waitForLoadState("domcontentloaded").catch(() => {});
      await expect(this.page.locator("#submitBtn")).toBeVisible({
        timeout: 15000,
      });

      const opened = await clickIfPresent(
        this,
        S.adminLogin.orgProducts.productDropdown,
      );
      if (!opened) throw new Error("Product dropdown not found.");

      await expect(this.page.locator("#autocompleteProduct")).toBeVisible({
        timeout: 15000,
      });

      await fillIfPresent(
        this,
        S.adminLogin.orgProducts.productSearchInput,
        courseId,
      );

      await this.page.waitForTimeout(500);

      const optionById = this.page.locator(
        S.adminLogin.orgProducts.productOptionByText(courseId),
      );

      const optionExists = await optionById
        .first()
        .isVisible()
        .then(() => true)
        .catch(() => false);

      if (optionExists) {
        await optionById.first().click();
      } else {
        const optionByName = this.page.locator(
          S.adminLogin.orgProducts.productOptionByText(courseName),
        );
        await expect(optionByName.first()).toBeVisible({ timeout: 8000 });
        await optionByName.first().click();
      }

      await clickIfPresent(this, S.adminLogin.orgProducts.organizationPayLabel);
      await clickIfPresent(this, S.adminLogin.orgProducts.unlimitedRadio);

      const submitted = await clickIfPresent(
        this,
        S.adminLogin.orgProducts.submitAddProduct,
      );
      if (!submitted)
        throw new Error("Submit Add Product button (#submitBtn) not found.");

      let flashText = "";
      const flashLocator = this.page.locator(
        '.alert-success, .flash-success, div:has-text("added successfully")',
      );

      const flashVisible = await flashLocator
        .first()
        .isVisible({ timeout: 5000 })
        .then(() => true)
        .catch(() => false);

      if (flashVisible) {
        flashText = (await flashLocator.first().innerText()).trim();
      }

      await this.page.waitForLoadState("domcontentloaded").catch(() => {});
      await this.page.waitForTimeout(1000);

      await attachCombinedReportBlock(
        `Course added: ${courseId} (${courseName})`,
        flashText,
      );
    }
  },
);

Then("Navigate to manage students page", async function (this: World) {
  // Use your “selectors list” safe-click style (prevents array passed to page.click errors)
  const ok = await clickIfPresent(
    this,
    S.adminLogin.manageStudents.manageStudentsNav,
  );
  if (!ok) throw new Error("Manage Students nav not found.");
});

Then(
  "Import {int} students from file {string}",
  async function (this: World, count: number, fileName: string) {
    if (!count || count <= 0) {
      throw new Error(`Invalid student count: ${count}`);
    }

    // 0) Click Import Demographic Data button (robust)
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await this.page.waitForTimeout(300);

    let importClicked = await clickIfPresent(
      this,
      S.adminLogin.manageStudents.importDemographicBtn,
    );

    if (!importClicked) {
      const importBtnByRole = this.page.getByRole("button", {
        name: /import demographic data/i,
      });
      const importLinkByRole = this.page.getByRole("link", {
        name: /import demographic data/i,
      });

      const btnVisible = await importBtnByRole
        .first()
        .isVisible()
        .catch(() => false);
      const linkVisible = await importLinkByRole
        .first()
        .isVisible()
        .catch(() => false);

      if (btnVisible) {
        await importBtnByRole
          .first()
          .scrollIntoViewIfNeeded()
          .catch(() => {});
        await importBtnByRole.first().click();
        importClicked = true;
      } else if (linkVisible) {
        await importLinkByRole
          .first()
          .scrollIntoViewIfNeeded()
          .catch(() => {});
        await importLinkByRole.first().click();
        importClicked = true;
      }
    }

    if (!importClicked) {
      await this.attach(
        `❌ Import Demographic Data not found on: ${this.page.url()}`,
        "text/plain",
      );
      throw new Error("Import Demographic Data button not found.");
    }

    // 1) Download template (Promise.all + click correct link)
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.page.waitForTimeout(500);

    const downloadsDir = path.resolve("reports/_tmp/downloads");
    ensureDir(downloadsDir);

    const downloadLinkByRole = this.page.getByRole("link", {
      name: /click here to download/i,
    });

    const downloadLinkVisible = await downloadLinkByRole
      .first()
      .isVisible()
      .catch(() => false);

    let templateDownload: any = null;

    try {
      const [dl] = await Promise.all([
        this.page.waitForEvent("download", { timeout: 30000 }),
        (async () => {
          if (downloadLinkVisible) {
            await downloadLinkByRole
              .first()
              .scrollIntoViewIfNeeded()
              .catch(() => {});
            await downloadLinkByRole.first().click();
            return;
          }

          const ok = await clickIfPresent(
            this,
            S.adminLogin.manageStudents.downloadTemplateLink,
          );
          if (!ok) {
            const anyCsvLink = this.page.locator(
              'a:has-text("download"):has-text("CSV"), a:has-text("download"):has-text("template"), a[href*="download"], a[href*=".csv"]',
            );
            const hasAny = (await anyCsvLink.count().catch(() => 0)) > 0;
            if (hasAny) {
              await anyCsvLink
                .first()
                .scrollIntoViewIfNeeded()
                .catch(() => {});
              await anyCsvLink.first().click();
              return;
            }
            throw new Error("Download template link not clickable.");
          }
        })(),
      ]);

      templateDownload = dl;
    } catch {
      templateDownload = null;
    }

    if (!templateDownload) {
      const links = await this.page
        .locator("a")
        .allInnerTexts()
        .catch(() => []);
      await this.attach(
        `❌ Download template link not found.\nURL: ${this.page.url()}\n\nLinks on page:\n` +
          links
            .filter(Boolean)
            .map((t: string) => `- ${t}`)
            .join("\n"),
        "text/plain",
      );
      throw new Error("Download template link not found.");
    }

    const runName =
      String(process.env.RUN_NAME || process.env.REPORT_NAME || "").trim() ||
      new Date().toISOString().replace(/[:.]/g, "-");

    const suggested = templateDownload.suggestedFilename?.() || "template.csv";
    const templatePath = path.join(downloadsDir, `${runName}__${suggested}`);
    await templateDownload.saveAs(templatePath);

    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.page.waitForTimeout(500);

    // 2) Read template header
    const templateText = fs.readFileSync(templatePath, "utf-8");
    const headers = parseCsvHeader(templateText);
    if (!headers.length) {
      throw new Error("Downloaded template CSV header is empty/unreadable.");
    }

    // 3) Create UNIQUE users
    const createdUsers: Array<{
      userId: string;
      firstName: string;
      lastName: string;
      email: string;
      orgUnitNames?: string;
    }> = [];

    const base = Date.now();

    for (let i = 0; i < count; i++) {
      const suf = `${base}${i}${Math.floor(Math.random() * 1000)}`.slice(-20);

      const firstName = `auto_first_${suf}`.slice(0, 49);
      const lastName = `auto_last_${suf}`.slice(0, 49);
      const userId = `auto_userid_${suf}`.slice(0, 49);
      const email = `${firstName}@rqimail.laerdalblr.in`;

      const orgUnitNames = `L1_${suf}|L2_${suf}|L3_${suf}`;
      createdUsers.push({ userId, firstName, lastName, email, orgUnitNames });
    }

    // 4) Build CSV
    const rows: string[] = [];
    rows.push(headers.join(","));

    for (const u of createdUsers) {
      const values: Record<string, string> = {};

      values["org unit names"] = u.orgUnitNames ?? "";

      values["userid"] = u.userId;
      values["user id"] = u.userId;
      values["first name"] = u.firstName;
      values["firstname"] = u.firstName;
      values["last name"] = u.lastName;
      values["lastname"] = u.lastName;
      values["email"] = u.email;

      values["status : active or inactive"] = "Active";
      values["status"] = "Active";

      rows.push(buildRowByHeader(headers, values));
    }

    // 5) Save generated file
    const generatedPath = path.join(downloadsDir, `${runName}__${fileName}`);
    fs.writeFileSync(generatedPath, rows.join("\n"), "utf-8");

    await this.attach(
      `✅ Created ${createdUsers.length} users:\n` +
        createdUsers
          .map(
            (u) => `${u.userId} | ${u.firstName} | ${u.lastName} | ${u.email}`,
          )
          .join("\n"),
      "text/plain",
    );

    // 6) Upload CSV (file input is hidden - do NOT wait for visible)
    let fileInput = this.page
      .locator(S.adminLogin.manageStudents.chooseFileInput[0])
      .first();

    const isHidden = await fileInput
      .evaluate((el: Element) => (el as HTMLInputElement).offsetParent === null)
      .catch(() => true);

    if (isHidden) {
      fileInput = this.page.locator('input#upload[type="file"]').first();
    }

    await fileInput.setInputFiles(generatedPath);

    // ✅ Upload CSV: robust upload locator resolution + enable wait + click
    await this.page.waitForTimeout(500);

    const uploadSelectors = S.adminLogin.manageStudents.uploadBtn;

    const firstExisting = async (sels: readonly string[]) => {
      for (const sel of sels) {
        const loc = this.page.locator(sel).first();
        const c = await loc.count().catch(() => 0);
        if (c > 0) return loc;
      }
      return null;
    };

    let uploadLoc = await firstExisting(uploadSelectors);

    if (!uploadLoc) {
      const inputUpload = this.page
        .locator(
          'input[type="submit"][value="Upload"], input[type="button"][value="Upload"], input[value="Upload"]',
        )
        .first();
      if ((await inputUpload.count().catch(() => 0)) > 0)
        uploadLoc = inputUpload;
    }

    if (!uploadLoc) {
      const anyUpload = this.page
        .locator('button:has-text("Upload"), a:has-text("Upload")')
        .first();
      if ((await anyUpload.count().catch(() => 0)) > 0) uploadLoc = anyUpload;
    }

    if (!uploadLoc) {
      const btnTexts = await this.page
        .locator("button, input[type=submit], input[type=button], a")
        .allInnerTexts()
        .catch(() => []);
      await this.attach(
        `❌ Upload button not found.\nURL: ${this.page.url()}\n\nClickable texts found:\n` +
          btnTexts
            .filter(Boolean)
            .map((t: string) => `- ${t.trim()}`)
            .join("\n"),
        "text/plain",
      );
      throw new Error("Upload button not found.");
    }

    await uploadLoc.scrollIntoViewIfNeeded().catch(() => {});
    await this.page.waitForTimeout(300);
    await expect(uploadLoc)
      .toBeEnabled({ timeout: 15000 })
      .catch(() => {});
    await uploadLoc.click().catch(async () => {
      await uploadLoc.click({ force: true }).catch(() => {});
    });

    // ✅ SUCCESS STATUS POPUP (capture + close)
    const statusModal = this.page
      .locator(".modal-content")
      .filter({ hasText: /your import request was processed successfully/i })
      .filter({ hasText: /no\.\s*of\s*records/i })
      .first();

    await expect(statusModal).toBeVisible({ timeout: 60000 });

    const statusText = (await statusModal.innerText().catch(() => "")).trim();
    await this.attach(
      `✅ Import Status Popup (Success):\n${statusText || "(no text)"}`,
      "text/plain",
    );

    const statusCloseBtn = statusModal
      .locator(
        'button:has-text("Close"), input[value="Close"], a:has-text("Close")',
      )
      .first();

    await expect(statusCloseBtn).toBeVisible({ timeout: 15000 });
    await statusCloseBtn.scrollIntoViewIfNeeded().catch(() => {});
    await statusCloseBtn.click().catch(async () => {
      await statusCloseBtn.click({ force: true }).catch(() => {});
    });

    await expect(statusModal).toBeHidden({ timeout: 20000 });

    // 7) Keep your existing flash capture (non-blocking)
    const flash = await tryGetFlashText(this.page);
    if (flash) {
      await this.attach(`✅ Import success message:\n${flash}`, "text/plain");
    } else {
      await this.attach(
        "⚠️ No import success message displayed.",
        "text/plain",
      );
    }

    // =========================================================
    // ✅ REQUIRED: Select Status = Active, CLICK SEARCH, validate users
    // ✅ FIXED: pagination-aware validation (covers page 1..N)
    // =========================================================

    // Select Status dropdown (All / Active / Inactive)
    const statusSelect = this.page
      .locator("select")
      .filter({ has: this.page.locator("option", { hasText: "Active" }) })
      .first();
    await expect(statusSelect).toBeVisible({ timeout: 20000 });
    await statusSelect.selectOption({ label: "Active" }).catch(async () => {
      await statusSelect.selectOption("Active").catch(() => {});
    });

    // Click Search button (magnifier)
    let clickedSearch = await clickIfPresent(
      this,
      S.adminLogin.manageStudents.searchBtn,
    );

    if (!clickedSearch) {
      // fallback: the magnifier button near dropdown (screenshot)
      const magnifier = this.page
        .locator("button")
        .filter({
          has: this.page.locator("span.glyphicon-search, i.fa-search"),
        })
        .first();

      if (await magnifier.isVisible().catch(() => false)) {
        await magnifier.click().catch(async () => {
          await magnifier.click({ force: true }).catch(() => {});
        });
        clickedSearch = true;
      }
    }

    if (!clickedSearch) {
      // fallback: button right after status dropdown (common layout)
      const btnAfterSelect = statusSelect
        .locator("xpath=following::button[1]")
        .first();
      if (await btnAfterSelect.isVisible().catch(() => false)) {
        await btnAfterSelect.click().catch(async () => {
          await btnAfterSelect.click({ force: true }).catch(() => {});
        });
        clickedSearch = true;
      }
    }

    if (!clickedSearch) {
      await this.attach(
        `❌ Search button not found/clickable.\nURL: ${this.page.url()}`,
        "text/plain",
      );
      throw new Error("Search button not found.");
    }

    // Wait for results to render
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.page.waitForTimeout(800);

    // ✅ Correct results table: must contain header "USER ID"
    const resultsTable = this.page
      .locator("table")
      .filter({ hasText: /user\s*id/i })
      .first();
    await expect(resultsTable).toBeVisible({ timeout: 20000 });

    const tbody = resultsTable.locator("tbody");
    await expect(tbody)
      .toBeVisible({ timeout: 20000 })
      .catch(() => {});

    // Helper: read all userIds from current page (handles wrapping)
    const readCurrentPageUserIds = async (): Promise<Set<string>> => {
      const ids = new Set<string>();
      const rows = tbody.locator("tr");
      const rowCount = await rows.count().catch(() => 0);

      for (let i = 0; i < rowCount; i++) {
        const row = rows.nth(i);
        const txt = (await row.innerText().catch(() => "")).trim();
        if (!txt) continue;

        const matches = txt.match(/auto_userid_\d+/g) || [];
        for (const m of matches) ids.add(m);
      }
      return ids;
    };

    // Helper: click Next page if enabled (DataTables style)
    const clickNextIfEnabled = async (): Promise<boolean> => {
      const paginate = this.page.locator(
        'div.dataTables_paginate, .dataTables_paginate, nav[aria-label*="pagination"]',
      );

      const nextBtn = paginate
        .locator(
          'a:has-text("Next"), button:has-text("Next"), li:has-text("Next") a',
        )
        .first();

      const exists = (await nextBtn.count().catch(() => 0)) > 0;
      if (!exists) return false;

      const disabled = await nextBtn
        .evaluate((el: Element) => {
          const a = el as HTMLElement;
          const aria = a.getAttribute("aria-disabled");
          const cls = a.className || "";
          const parentCls = a.parentElement?.className || "";
          return (
            aria === "true" ||
            /disabled/i.test(cls) ||
            /disabled/i.test(parentCls)
          );
        })
        .catch(() => false);

      if (disabled) return false;

      await nextBtn.click().catch(async () => {
        await nextBtn.click({ force: true }).catch(() => {});
      });

      await this.page.waitForTimeout(800);
      return true;
    };

    // Start from page 1 if present (avoids starting on page 2)
    const paginateRoot = this.page.locator(
      "div.dataTables_paginate, .dataTables_paginate",
    );
    const page1 = paginateRoot
      .locator('a:has-text("1"), button:has-text("1")')
      .first();
    if ((await page1.count().catch(() => 0)) > 0) {
      await page1.click().catch(() => {});
      await this.page.waitForTimeout(500);
    }

    const seen = new Set<string>();
    let safety = 0;

    do {
      const ids = await readCurrentPageUserIds();
      ids.forEach((x) => seen.add(x));

      safety++;
      if (safety > 25) break; // safety against infinite loops
    } while (await clickNextIfEnabled());

    // Validate
    const expectedIds = createdUsers.map((u) => u.userId);
    const missing = expectedIds.filter((id) => !seen.has(id));

    if (missing.length > 0) {
      // include current table snapshot for debug
      const snap = (await resultsTable.innerText().catch(() => "")).trim();
      await this.attach(
        `❌ Missing imported users after Status=Active + Search (checked pagination).\nMissing (${missing.length}):\n` +
          missing.map((m) => `- ${m}`).join("\n") +
          `\n\n(First 1200 chars of table)\n` +
          snap.slice(0, 1200),
        "text/plain",
      );
      throw new Error(
        `Some imported users not found in results table (${missing.length}).`,
      );
    }

    await this.attach(
      `✅ All imported users found in results table (checked pagination).\nTotal expected: ${expectedIds.length}\nTotal seen: ${seen.size}`,
      "text/plain",
    );

    // 9) Cleanup files
    deleteIfExists(generatedPath);
    deleteIfExists(templatePath);

    await this.attach(
      `🧹 Cleaned up files:\n- ${generatedPath}\n- ${templatePath}`,
      "text/plain",
    );
  },
);
