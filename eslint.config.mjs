import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cypress specs are TypeScript but use Cypress globals (cy, Cypress) and
    // their own tsconfig; keep them out of the Next app's lint scope.
    "cypress/**",
    // Selenium specs (framework #3) likewise live under their own tsconfig +
    // Mocha runner; keep them out of the Next app's lint scope.
    "selenium/**",
  ]),
]);

export default eslintConfig;
