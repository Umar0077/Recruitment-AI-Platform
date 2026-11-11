import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "node_modules/**", "*.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-extraneous-class": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  { files: ["prisma/**/*.ts"], rules: { "no-console": "off" } },
);
