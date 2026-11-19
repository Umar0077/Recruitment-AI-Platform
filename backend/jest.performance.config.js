/** Pure query-shape and reliability tests. No .env, migration or destructive global setup. */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
  moduleFileExtensions: ["ts", "js", "json"],
  testRegex: "test/performance/.*\\.spec\\.ts$",
  testTimeout: 15000,
};
