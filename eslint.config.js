import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const SOURCE_FILES = ["src/**/*.{js,ts}", "scripts/**/*.ts"];

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**"],
  },
  {
    ...eslint.configs.recommended,
    files: SOURCE_FILES,
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: SOURCE_FILES,
  })),
  {
    files: SOURCE_FILES,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        Bun: "readonly",
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
);
