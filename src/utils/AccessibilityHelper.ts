import { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHtmlReport } from "axe-html-reporter";
import path from "path";
import fs from "fs";

export class AccessibilityHelper {
  /**
   * Scans the current page for accessibility violations.
   * Generates a report for BOTH Pass and Fail scenarios.
   */
  static async checkAccessibility(page: Page, reportName: string) {
    try {
      // 1. Run the scan
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const violationCount = accessibilityScanResults.violations.length;
      const status = violationCount > 0 ? "FAIL" : "PASS";

      // 2. Define Output Directory (RELATIVE PATH ONLY)
      // FIX: We use a simple string here. The library will calculate the full path itself.
      const relativeOutputDir = "reports/_tmp/accessibility";

      // We still resolve it manually just to create the folder safely
      const absolutePath = path.resolve(relativeOutputDir);
      if (!fs.existsSync(absolutePath)) {
        fs.mkdirSync(absolutePath, { recursive: true });
      }

      // 3. Generate the Report File
      const reportFile = `${reportName}_${status}_${Date.now()}.html`;

      createHtmlReport({
        results: accessibilityScanResults,
        options: {
          projectKey: "ACCESS_TEST",
          outputDir: relativeOutputDir, // <-- Passing relative path fixes the duplication error
          reportFileName: reportFile,
        },
      });

      // 4. Log to Console
      const fullReportPath = path.join(absolutePath, reportFile);
      if (violationCount > 0) {
        console.log(
          `\n⚠️ ACCESSIBILITY WARNING: ${violationCount} violations on ${reportName}`,
        );
        console.log(`📄 Report saved: ${fullReportPath}\n`);
      } else {
        console.log(`\n✅ Accessibility Passed: ${reportName}`);
        console.log(`📄 Report saved: ${fullReportPath}\n`);
      }
    } catch (error) {
      console.error(`❌ Accessibility scan failed for ${reportName}`, error);
    }
  }
}
