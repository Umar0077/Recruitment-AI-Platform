/** Database-free auth/security tests. Never load .env or the database-reset global setup. */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
  moduleFileExtensions: ["ts", "js", "json"],
  testRegex: "test/auth/.*\\.spec\\.ts$",
  testTimeout: 15000,
};
