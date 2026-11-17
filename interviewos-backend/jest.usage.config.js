/** Database-free usage tests. Deliberately omit the default database-reset global setup. */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
  moduleFileExtensions: ["ts", "js", "json"],
  testRegex: "test/(usage/.*|unit/(openrouter|assessment))\\.spec\\.ts$",
  testTimeout: 15000,
};
