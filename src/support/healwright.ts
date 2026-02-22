import { withHealing } from "healwright";

export function isHealEnabled(): boolean {
  return String(process.env.SELF_HEAL || "").trim() === "1";
}

export function wrapWithHealwright<TPage = any>(page: TPage): TPage {
  // Healwright wraps Playwright page and exposes `page.heal.*` helpers. :contentReference[oaicite:5]{index=5}
  return withHealing(page as any) as any;
}

export type HealMeta = {
  enabled: boolean;
  used: boolean;
  messages: string[];
};
