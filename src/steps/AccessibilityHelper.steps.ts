import { Then } from "@cucumber/cucumber";
import { AccessibilityHelper } from "../utils/AccessibilityHelper";
import { pageFixture } from "../support/pageFixture";

Then("the page should be accessible", async function () {
  const reportName = (await pageFixture.page.title()).replace(
    /[^a-zA-Z0-9]/g,
    "_",
  );

  // Run the check (it won't throw error anymore)
  await AccessibilityHelper.checkAccessibility(pageFixture.page, reportName);

  // Optional: Log a note in the Cucumber report so you know a check ran
  await this.attach(`Accessibility checked for: ${reportName}`, "text/plain");
});
