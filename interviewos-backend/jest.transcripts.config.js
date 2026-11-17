/** Isolated tests with mocked persistence. Never load .env, reset, seed or connect to a database. */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
  moduleFileExtensions: ["ts", "js", "json"],
  testRegex: "test/transcripts/.*\\.spec\\.ts$",
  testTimeout: 15000,
};
