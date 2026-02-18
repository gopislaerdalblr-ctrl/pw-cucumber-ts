import { Given, When, Then } from "@cucumber/cucumber";
import { expect, Page, Locator } from "playwright/test";
import { World } from "../support/world";
import { S } from "../ui/selectors";
import { fillIfPresent } from "../utils/ui-actions";
import { waitForDebugger } from "node:inspector";

type ClickIfPresentOptions = {
  strictClick?: boolean; // if true, throw when nothing clicked
  timeoutMs?: number; // click timeout
  attachDebug?: boolean; // attach clicked element details to report
};

export async function clickIfPresent(
  world: any,
  selectors: readonly string[],
  options: ClickIfPresentOptions = {},
): Promise<boolean> {
  const page = world.page;
  const strictClick = options.strictClick ?? false;
  const timeoutMs = options.timeoutMs ?? 10000;
  const attachDebug = options.attachDebug ?? true;

  for (const sel of selectors) {
    const loc = page.locator(sel);

    let count = 0;
    try {
      count = await loc.count();
    } catch {
      count = 0;
    }
    if (!count) continue;

    // IMPORTANT: try all matches, not first()
    for (let i = 0; i < count; i++) {
      const el = loc.nth(i);

      try {
        await el.waitFor({ state: "visible", timeout: 2000 });

        const href = await el.getAttribute("href").catch(() => null);
        const text = ((await el.textContent().catch(() => "")) ?? "").trim();

        // EXTRA SAFETY: if this selector is meant for logout, enforce it
        if (sel.includes("elearning_signout")) {
          if (!href || !href.includes("elearning_signout")) continue;
        }

        if (attachDebug && typeof world.attach === "function") {
          try {
            await world.attach(
              `Clicked selector: ${sel}\nIndex: ${i}\nText: ${text}\nHref: ${href}`,
              "text/plain",
            );
          } catch {
            // ignore attach errors
          }
        }

        await el.scrollIntoViewIfNeeded().catch(() => {});
        await el.click({ timeout: timeoutMs });

        return true; // only return true if click succeeded
      } catch {
        // try next match/selector
        continue;
      }
    }
  }

  if (strictClick) {
    throw new Error(
      `clickIfPresent(strict): Could not click any element for selectors:\n- ${selectors.join("\n- ")}`,
    );
  }

  return false;
}

Then("Navigate to Access Organization page", async function (this: World) {
  await this.page.waitForTimeout(2000);

  await clickIfPresent(this, S.adminLogin.orgListingActions.orgActions);

  await this.page.waitForLoadState("networkidle");

  await expect(
    this.page.getByRole("link", { name: /Organi[sz]ation Details/ }),
  ).toBeVisible({ timeout: 20000 });

  await clickIfPresent(this, S.adminLogin.AccessOrganization);

  console.log("Current URL:", this.page.url());
  await this.attach(
    `Navigated to Access Organization page: ${this.page.url()}`,
    "text/plain",
  );
});

Then("Click on Support Action dropdown", async function (this: World) {
  await this.page.waitForTimeout(2000);

  await clickIfPresent(this, S.adminLogin.SupportActionDropdown);
});

Then("Click on Merge Account option", async function (this: World) {
  await this.page.waitForTimeout(2000);

  await clickIfPresent(this, S.adminLogin.MergeAccountOption);
});

Then("Merge user page should load successfully", async function (this: World) {
  await this.page.waitForLoadState("networkidle");
  const currentUrl = this.page.url();
  console.log("Current Page URL:", currentUrl);

  await this.attach(currentUrl, "text/plain");
});

type PWWorld = {
  page: Page;
  attach: (data: string | Buffer, mediaType: string) => Promise<void>;
};

async function dismissCookieIfPresent(page: Page) {
  const allowAll = page.getByRole("button", { name: /allow all cookies/i });
  const denyAll = page.getByRole("button", { name: /do not allow cookies/i });

  if (await allowAll.isVisible().catch(() => false)) {
    await allowAll.click();
  } else if (await denyAll.isVisible().catch(() => false)) {
    await denyAll.click();
  }
}

function panelByHeading(page: Page, headingText: string): Locator {
  // Finds a container that contains the heading text (works even if HTML tags differ)
  return page
    .locator("div, section")
    .filter({
      has: page.getByText(headingText, { exact: true }),
    })
    .first();
}

async function validateAccountPanel(
  panel: Locator,
  title: "Account 1" | "Account 2",
) {
  await expect(panel.getByText(title, { exact: true })).toBeVisible();
  await expect(panel.getByText(/select the account to retain/i)).toBeVisible();

  // Search input
  await expect(panel.getByPlaceholder(/search for user id/i)).toBeVisible();

  // Selected user + Remove (best-effort, as UI might vary)
  await expect(panel.getByText(/remove/i)).toBeVisible();

  // Courses section
  await expect(panel.getByText("Courses", { exact: true })).toBeVisible();

  // At least 1 course row with metadata
  const courseRows = panel
    .locator("div")
    .filter({ has: panel.getByText(/topics:/i) });
  const firstRow = courseRows.first();

  await expect(firstRow).toBeVisible();
  await expect(firstRow.getByRole("checkbox")).toBeVisible();
  await expect(firstRow.getByText(/completed|in progress/i)).toBeVisible();
  await expect(firstRow.getByText(/topics:/i)).toBeVisible();
  await expect(firstRow.getByText(/compliant until/i)).toBeVisible();
}

Then(
  "Validate the UI elements on Merge user page",
  async function (this: PWWorld) {
    const isVisible = await this.page
      .getByRole("heading", { name: "Merge Accounts" })
      .isVisible()
      .catch(() => false);

    if (!isVisible) {
      throw new Error("Merge Accounts page is not available in instance");
    }

    const page = this.page;

    // Handle cookie banner if it blocks
    await dismissCookieIfPresent(page);

    // Attach current URL to Cucumber report
    const url = page.url();
    await this.attach(`Merge Accounts URL: ${url}`, "text/plain");

    // Page header
    await expect(
      page.getByRole("heading", { name: "Merge Accounts" }),
    ).toBeVisible();

    // Panels
    const account1 = panelByHeading(page, "Account 1");
    const account2 = panelByHeading(page, "Account 2");
    const mergedAccount = panelByHeading(page, "Merged Account");

    await expect(account1).toBeVisible();
    await expect(account2).toBeVisible();
    await expect(mergedAccount).toBeVisible();

    // Account 2 retained badge
    await expect(account2.getByText(/retained/i)).toBeVisible();

    // Validate Account panels
    await validateAccountPanel(account1, "Account 1");
    await validateAccountPanel(account2, "Account 2");

    // Merged Account panel validations
    await expect(
      mergedAccount.getByText(/account retained post merge/i),
    ).toBeVisible();
    await expect(mergedAccount.getByText(/retained user/i)).toBeVisible();

    // Retained Records section + at least 1 card
    await expect(
      mergedAccount.getByText("Retained Records", { exact: true }),
    ).toBeVisible();

    const retainedCards = mergedAccount.locator("div").filter({
      has: mergedAccount.getByText(/topics:/i),
    });
    await expect(retainedCards.first()).toBeVisible();

    // Optional: attach a screenshot to report (super useful for UI validation)
    const shot = await page.screenshot({ fullPage: true });
    await this.attach(shot, "image/png");
  },
);

Then("Logout from the application", async function (this: World) {
  await clickIfPresent(this, S.adminLogin.profileDropdown);
  await this.page.waitForTimeout(2000);

  await clickIfPresent(this, S.adminLogin.logoutLink, { strictClick: true });

  console.log("Current URL:", this.page.url());
  await this.attach(`After logout URL: ${this.page.url()}`, "text/plain");
});
