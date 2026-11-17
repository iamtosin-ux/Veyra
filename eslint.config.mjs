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
    // The marketing demo and its Stageshow kit belong to the future website, not this app.
    "marketing/**",
    // BoardUI's generated components, kept as the library ships them (npx boardui add).
    "src/components/base/**",
    "src/components/application/**",
    "src/components/foundations/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
