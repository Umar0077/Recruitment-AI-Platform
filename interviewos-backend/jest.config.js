/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
  moduleFileExtensions: ["ts", "js", "json"],
  testRegex: "test/.*\\.(spec|e2e-spec)\\.ts$",
  setupFiles: ["<rootDir>/test/env.ts"],
  globalSetup: "<rootDir>/test/global-setup.ts",
  testTimeout: 60000,
};
