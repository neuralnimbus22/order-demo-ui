# Testing — overview

This repo carries an unusually broad test stack: the same UI journeys are covered in
**four** frameworks, plus load, accessibility, API-contract, and security tools. The
point is to mirror how a tool-agnostic orchestrator (TestKube) runs *any* tool against
the deployed app. Per-suite detail is in [suites.md](suites.md). The testing rules are in
[`CLAUDE.md`](../../CLAUDE.md).

## The shared E2E target convention

There is **one** way every E2E suite finds the app, so all frameworks behave identically
locally and in-cluster:

- **One env var: `E2E_BASE_URL`.** Every framework reads it. Default when unset:
  `http://localhost:3000`.
- **The app is assumed already running at `E2E_BASE_URL`. The harness never starts it.**
  Playwright's `webServer` self-spawn was removed on purpose — a runner must not behave
  differently locally than in-cluster, where TestKube points it at a deployed URL.
- Two run modes: (a) local — `npm run dev` + the five backend port-forwards, then the
  suite; (b) deployed — `E2E_BASE_URL=<url>` → the suite hits a running UI.

Backend-touching specs need the five services reachable (user-session 3006,
product-catalog 3005, order 3002, payment 3004, inventory 3003); smoke specs are
backend-free. (Rule: [`CLAUDE.md` → the shared E2E target convention](../../CLAUDE.md).)

## The functional mirror

The Cypress and Selenium suites are **1:1 mirrors** of the Playwright coverage — the same
19 flows (smoke 2, auth 6, storefront 5, checkout 4, order-status 2), the same
`data-testid`s, the same seeded demo login, **no new test logic and no app-code changes**.
The Java BDD suite adds a business-readable Gherkin slice of the same flows. This is why
the [`data-testid` contract](../frontend.md#the-data-testid-contract) matters.

## Suite matrix

| Suite | Type | Command | Where |
|---|---|---|---|
| Playwright | functional E2E (chromium) | `npm run test:e2e` | `e2e/*.spec.ts` |
| Playwright + axe | accessibility (WCAG A/AA) | `npm run test:a11y` | `e2e/a11y.spec.ts` |
| Playwright convergence | real event convergence | `npm run test:e2e:convergence` | `e2e/convergence.spec.ts` |
| Cypress | functional E2E (mirror) | `npm run test:cypress` | `cypress/e2e/*.cy.ts` |
| Selenium | functional E2E (mirror) | `npm run test:selenium` | `selenium/*.test.ts` |
| BDD (Cucumber/Java) | Gherkin functional | `cd bdd && mvn test` | `bdd/` |
| JMeter | load | `npm run test:load` | `jmeter/` |
| Gatling | load (Scala DSL) | `npm run test:load:gatling` | `gatling/` |
| Newman | BFF API contract | `npm run test:bff-contract` | `newman/` |
| Semgrep | SAST (source) | `npm run test:sast` | `semgrep/` |
| Trivy | image CVE scan | `npm run test:trivy` | `trivy/` |

## Build/lint isolation

Each non-Playwright suite is isolated from `npm run build` (`next build`) and
`npm run lint` (`eslint`):

- **Cypress / Selenium** — own `tsconfig.json` + runner config; `cypress/**` and
  `selenium/**` are in `eslint.config.mjs` globalIgnores and the root `tsconfig.json`
  excludes, so their specs never enter the Next build or lint.
- **Playwright** `e2e/` + `playwright.config.ts` are compiled/linted by the Next app but
  excluded from the Docker build context via `.dockerignore`.
- **BDD, Gatling, JMeter, Newman, Semgrep, Trivy** are self-contained (Maven / shell /
  Docker) and never touched by the Node build or lint.

## Honest gates

Every gate is designed so a broken or non-running scan can't masquerade as green:
JMeter parses the `.jtl` `success` column (its CLI exits 0 even on failures); Semgrep and
Trivy exit `2` on an incomplete scan (distinct from `1` = gated findings); Newman and
Gatling fail natively. The security suites **surface issues, they do not fix them**, and
the gates are never loosened to force green — see
[`CLAUDE.md` → Security testing](../../CLAUDE.md) and [suites.md](suites.md) for the
current honest-red results.
