# UI-layer BDD suite

Self-contained Cucumber (JUnit 5 Platform) + Selenium BDD suite covering the
**UI layer** of `order-demo-ui`. It drives a real headless Chrome against the
running storefront — one folder per tool, alongside `cypress/`, `selenium/`,
`jmeter/`, `gatling/`, `newman/`, ...

- **Stack:** Java 17, Maven, `cucumber-java` + `cucumber-junit-platform-engine`
  (JUnit 5), Selenium (headless Chrome). `maven-surefire-plugin` writes JUnit XML
  to `target/surefire-reports/`.
- **Driver:** chromedriver is resolved automatically by **Selenium Manager** — no
  hardcoded path. Set `CHROME_BIN` to point at a specific Chrome/Chromium binary
  if the default resolution doesn't fit (e.g. arm64 nodes with only chromium).
- **Layout:** features under `src/test/resources/features/`, step definitions per
  domain under `src/test/java/.../steps/`, browser lifecycle in `.../support/`,
  one runner (`RunCucumberTest`).

## Prerequisites

- JDK 17 and Maven 3.9+.
- Google Chrome (or Chromium) installed.
- The `order-demo-ui` app **already running** at the configured base URL — this
  suite never starts it. The app talks to its backend services in-cluster, so no
  backend port-forwards are needed for the UI run itself.

## Configuration

The base URL resolves in this order (first non-blank wins):

1. `-Dui.base.url` system property
2. `E2E_BASE_URL` environment variable (the name the other tools in this repo use)
3. the in-cluster default from `k8s/order-demo-ui.yaml`:
   `http://order-demo-ui.order-demo.svc.cluster.local:3000`

## Running

Inside the cluster (default resolves):

```bash
cd bdd
mvn test
```

Locally against the port-forwarded UI:

```bash
kubectl -n order-demo port-forward svc/order-demo-ui 3000:3000 &

cd bdd
mvn test -Dui.base.url=http://localhost:3000
# or: E2E_BASE_URL=http://localhost:3000 mvn test
```

## Tag filtering

Tags: `@ui` on everything, plus `@smoke` (storefront + product page render) and
`@session` (browser login).

```bash
mvn test -Dcucumber.filter.tags="@ui"               # the whole suite
mvn test -Dcucumber.filter.tags="@ui and @smoke"    # storefront render only
mvn test -Dcucumber.filter.tags="@ui and @session"  # browser login only
```

## Running a single feature file

```bash
mvn test -Dcucumber.features=src/test/resources/features/login.feature
```

## Reports

- JUnit XML: `target/surefire-reports/`
- Cucumber HTML: `target/cucumber-report.html`
