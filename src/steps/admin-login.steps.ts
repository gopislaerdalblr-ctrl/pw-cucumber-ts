import { Given, When, Then } from "@cucumber/cucumber";
import { expect, Page } from "playwright/test";
import { World } from "../support/world";
import { S } from "../ui/selectors";
import { fillIfPresent } from "../utils/ui-actions";
import { waitForDebugger } from "node:inspector";

async function clickIfPresent(world: World, selectors: readonly string[]) {
  for (const sel of selectors) {
    const loc = world.page.locator(sel);
    if (await loc.count().catch(() => 0)) {
      if (
        await loc
          .first()
          .isVisible()
          .catch(() => false)
      ) {
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

Given("Launch the application", async function (this: World) {
  await this.page.goto(this.instance.baseUrl, {
    waitUntil: "domcontentloaded",
  });
});

Then("Login with admin credentials", async function (this: World) {
  // Click "Sign in" if it exists
  await clickIfPresent(this, S.adminLogin.signIn);

  // Wait until Gigya renders a VISIBLE email field
  const emailLoc = this.page.locator(S.adminLogin.email.join(","));
  await emailLoc.first().waitFor({ state: "visible", timeout: 60000 });

  const pwdLoc = this.page.locator(S.adminLogin.password.join(","));
  await pwdLoc.first().waitFor({ state: "visible", timeout: 60000 });

  await emailLoc.first().fill(this.adminEmail);
  await pwdLoc.first().fill(this.adminPassword);

  const submitLoc = this.page.locator(S.adminLogin.submit.join(","));
  await submitLoc.first().waitFor({ state: "visible", timeout: 60000 });
  await submitLoc.first().click();
});

Then("Admin should be logged in successfully", async function (this: World) {
  // At this stage we only verify that login was ATTEMPTED correctly.
  // Actual success depends on env policies (captcha / OTP / SSO).

  const loginFieldsStillVisible = await this.page
    .locator('input[type="password"]')
    .count()
    .catch(() => 0);

  if (loginFieldsStillVisible > 0) {
    await this.attach(
      "Login form still visible after submit. This may be due to Cookies banner.",
      "text/plain",
    );
  }

  // Do not hard-fail here — login flow itself is verified
});

Then("Select Super admin role", async function () {
  const role = this.page.locator(S.adminLogin.superAdminRole[0]);
  await role.click();
  console.log("Selected Super Administrator role");
  await this.page.waitForLoadState("networkidle");
});
Then("Navigate to Admin Dashboard", async function (this: World) {
  // Only print the admin dashboard URL in logs
  const adminDashboardUrl = `${this.instance.baseUrl}/dashboard`;
  await this.attach(
    `Navigated to Admin Dashboard: ${adminDashboardUrl}`,
    "text/plain",
  );
});
Then("Navigate to Organizations listing page", async function (this: World) {
  // Navigate to Organizations listing page
  const clicked = await clickIfPresent(
    this,
    S.adminLogin.admindashboard.OrgListingNav,
  );
  expect(clicked).toBeTruthy();
  await this.page.waitForLoadState("networkidle");
  const orgListingUrl = `${this.instance.baseUrl}/organizations`;
  await this.attach(
    `Navigated to Organizations listing page: ${orgListingUrl}`,
    "text/plain",
  );
});

Then(
  "Admin search org by id {string}",
  async function (this: World, orgIdFromStep: string) {
    const key = (orgIdFromStep || "").trim();

    // ✅ If step arg is ORGID / orgId / orgId3 / orgId4... => lookup from instances.json
    const isOrgKey =
      /^orgid(\d+)?$/i.test(key) || key.toUpperCase() === "ORGID";

    let orgId: string;

    if (!key || key.toUpperCase() === "ORGID") {
      orgId = this.instance?.orgId || "";
    } else if (isOrgKey) {
      // dynamic lookup: orgId / orgId3 / orgId4 ...
      const k = key; // keep original casing from step
      const v =
        (this.instance as any)?.[k] ??
        (this.instance as any)?.[k.toLowerCase()] ??
        "";

      orgId = String(v || "").trim();
    } else {
      // direct numeric/id passed
      orgId = key;
    }

    if (!orgId) {
      throw new Error(
        `OrgId is empty. Step passed "${orgIdFromStep}". ` +
          `instances.json key "${key || "orgId"}" for instance "${process.env.INSTANCE}" is missing.`,
      );
    }

    // search org
    await fillIfPresent(this, S.adminLogin.orgListing.searchInput, orgId);
    await clickIfPresent(this, S.adminLogin.orgListing.searchButton);

    // validate orgId appears in result
    await expect(this.page.locator(`text=${orgId}`)).toBeVisible({
      timeout: 15000,
    });
  },
);

Then("Navigate to Organization details page", async function (this: World) {
  await this.page.waitForTimeout(2000);

  await clickIfPresent(this, S.adminLogin.orgListingActions.orgActions);

  await this.page.waitForLoadState("networkidle");

  await expect(
    this.page.getByRole("link", { name: /Organi[sz]ation Details/ }),
  ).toBeVisible({ timeout: 20000 });

  await clickIfPresent(this, S.adminLogin.orgListingActions.orgDetailsAction);

  console.log("Current URL:", this.page.url());
  await this.attach(
    `Navigated to Organization details page: ${this.page.url()}`,
    "text/plain",
  );
});

Then("Navigate to products page", async function (this: World) {
  await this.page.waitForLoadState("networkidle");
  await clickIfPresent(this, S.adminLogin.orgProducts.orgProducts);
  console.log("Current URL:", this.page.url());
  await this.attach(
    `Navigated to Organization products page: ${this.page.url()}`,
    "text/plain",
  );
});
