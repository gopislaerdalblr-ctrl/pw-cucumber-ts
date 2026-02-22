// src/utils/ui-actions.ts
import type { World } from "../support/world";

function looksLikeSelectorFailure(err: unknown): boolean {
  const msg = errToString(err).toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("waiting for") ||
    msg.includes("locator") ||
    msg.includes("strict mode violation") ||
    msg.includes("not attached") ||
    msg.includes("detached") ||
    msg.includes("element is not visible")
  );
}

function errToString(err: unknown): string {
  if (err instanceof Error) return err.message || String(err);
  return String(err);
}

async function safeAttach(world: any, text: string) {
  try {
    if (world && typeof world.attach === "function") {
      await world.attach(text, "text/plain");
    }
  } catch {
    // ignore
  }
}

export type ClickIfPresentOptions = {
  strictClick?: boolean;
  timeoutMs?: number;
  attachDebug?: boolean;
};

export async function clickIfPresent(
  world: World,
  selectors: readonly string[],
  options: ClickIfPresentOptions = {},
): Promise<boolean> {
  const page: any = world.page;
  const strictClick = options.strictClick ?? false;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const attachDebug = options.attachDebug ?? true;

  for (const sel of selectors) {
    const loc = page.locator(sel);
    const count = await loc.count().catch(() => 0);
    if (!count) continue;

    for (let i = 0; i < count; i++) {
      const el = loc.nth(i);
      try {
        await el.waitFor({ state: "visible", timeout: 2000 });

        if (attachDebug) {
          const href = await el.getAttribute("href").catch(() => null);
          const text = ((await el.textContent().catch(() => "")) ?? "").trim();
          await safeAttach(
            world,
            `Click: ${sel}\nIndex: ${i}\nText: ${text}\nHref: ${href}`,
          );
        }

        await el.scrollIntoViewIfNeeded().catch(() => {});
        await el.click({ timeout: timeoutMs });
        return true;
      } catch (err: unknown) {
        // Healwright fallback (only if enabled and page.heal exists)
        if (
          world.heal?.enabled &&
          page?.heal &&
          looksLikeSelectorFailure(err)
        ) {
          try {
            await page.heal
              .locator(sel, `Auto-heal fallback for click: ${sel}`)
              .click({ timeout: timeoutMs });

            world.heal.used = true;
            world.heal.messages.push(
              `Healwright: selector issue detected and healed for click on "${sel}".`,
            );

            await safeAttach(
              world,
              `Healwright used (click)\nSelector: ${sel}\nReason: ${errToString(err)}`,
            );

            return true;
          } catch {
            // continue trying other matches/selectors
          }
        }
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

export async function fillIfPresent(
  world: World,
  selectors: readonly string[],
  value: string,
  options: { strict?: boolean; timeoutMs?: number } = {},
): Promise<boolean> {
  const page: any = world.page;
  const strict = options.strict ?? false;
  const timeoutMs = options.timeoutMs ?? 10_000;

  for (const sel of selectors) {
    const loc = page.locator(sel);
    const count = await loc.count().catch(() => 0);
    if (!count) continue;

    for (let i = 0; i < count; i++) {
      const el = loc.nth(i);
      try {
        await el.waitFor({ state: "visible", timeout: 2000 });
        await el.fill(value, { timeout: timeoutMs });
        return true;
      } catch (err: unknown) {
        if (
          world.heal?.enabled &&
          page?.heal &&
          looksLikeSelectorFailure(err)
        ) {
          try {
            await page.heal
              .locator(sel, `Auto-heal fallback for fill: ${sel}`)
              .fill(value, { timeout: timeoutMs });

            world.heal.used = true;
            world.heal.messages.push(
              `Healwright: selector issue detected and healed for fill on "${sel}".`,
            );

            await safeAttach(
              world,
              `Healwright used (fill)\nSelector: ${sel}\nReason: ${errToString(err)}`,
            );

            return true;
          } catch {
            // continue
          }
        }
      }
    }
  }

  if (strict) {
    throw new Error(
      `fillIfPresent(strict): Could not fill any element for selectors:\n- ${selectors.join("\n- ")}`,
    );
  }

  return false;
}
