## Setup on a new machine

1. Install Node (recommended: Node 20)
2. In project root run:
   npm run setup

To run tests:
npm test

## Setup (new machine)

```bash
npm run setup
npm test
npm run check:env

```

# 🎭 Playwright-Cucumber-TS Automation Framework

![Playwright](https://img.shields.io/badge/Playwright-Test-green)
![Cucumber](https://img.shields.io/badge/Cucumber-BDD-brightgreen)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue)
![Node.js](https://img.shields.io/badge/Node.js-16%2B-orange)

A robust End-to-End (E2E) test automation framework that combines the speed and reliability of **Playwright** with the readability of **Cucumber (BDD)** and the type safety of **TypeScript**.

---

## 🚀 Key Features

- **BDD Approach**: Write tests in plain English (`.feature` files) using Gherkin syntax.
- **Page Object Model (POM)**: Modular and reusable page classes for better maintenance.
- **Cross-Browser Support**: Run tests on Chromium, Firefox, and WebKit.
- **Parallel Execution**: drastically reduces test execution time.
- **Rich Reporting**: Generates HTML reports with screenshots and videos on failure.
- **CI/CD Ready**: Configured for easy integration with GitHub Actions or Jenkins.
- **Utilities**: Built-in helpers for random data generation, logging, and assertions.

---

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed:

1.  **Node.js** (v16 or higher): [Download here](https://nodejs.org/)
2.  **Visual Studio Code** (Recommended IDE): [Download here](https://code.visualstudio.com/)
3.  **Cucumber (Gherkin) Extension** for VS Code: [Cucumber (Gherkin) Full Support](https://marketplace.visualstudio.com/items?itemName=alexkrechik.cucumberautocomplete)

---

## ⚙️ Installation

1.  **Clone the repository:**

    ```bash
    git clone [https://github.com/gopislaerdalblr-ctrl/pw-cucumber-ts.git](https://github.com/gopislaerdalblr-ctrl/pw-cucumber-ts.git)
    cd pw-cucumber-ts
    ```

2.  **Install project dependencies:**

    ```bash
    npm install
    ```

3.  **Install Playwright browsers:**
    ```bash
    npx playwright install
    ```

---

## 📂 Project Structure

A high-level overview of the framework architecture:

```text
pw-cucumber-ts/
├── src/
│   ├── test/
│   │   ├── features/       # Gherkin feature files (.feature)
│   │   ├── steps/          # Step definitions (.ts)
│   │   └── hooks/          # Hooks (setup/teardown, screenshots)
│   ├── pages/              # Page Object Model (POM) classes
│   └── utils/              # Helper functions (logger, env reader)
├── test-results/           # Screenshots & traces (generated on run)
├── reports/                # HTML/JSON execution reports
├── cucumber.js             # Cucumber configuration
├── playwright.config.ts    # Playwright browser config
├── tsconfig.json           # TypeScript configuration
└── package.json            # Scripts and dependencies
```
