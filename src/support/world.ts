import {
  IWorldOptions,
  setWorldConstructor,
  World as CucumberWorld,
} from "@cucumber/cucumber";
import { Browser, BrowserContext, Page } from "playwright";
import type { HealMeta } from "./healwright";
import { isHealEnabled } from "./healwright";

export class World extends CucumberWorld {
  browser!: Browser;
  context!: BrowserContext;

  // NOTE: keep Page type, but we may wrap it (runtime adds page.heal)
  page!: Page & any;

  // runtime / config
  instance: any;
  adminEmail!: string;
  adminPassword!: string;

  // runtime values captured during execution
  sourceId?: string;

  // console logs for report attachments
  consoleLogs!: string[];

  // healwright tracking
  heal!: HealMeta;

  constructor(options: IWorldOptions) {
    super(options);
    this.consoleLogs = [];
    this.heal = {
      enabled: isHealEnabled(),
      used: false,
      messages: [],
    };
  }
}

setWorldConstructor(World);
