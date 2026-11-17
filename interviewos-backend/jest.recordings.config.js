/** Isolated, database-free tests. Never runs the destructive global database setup. */
module.exports = { rootDir: ".", testEnvironment: "node", transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }] }, moduleFileExtensions: ["ts", "js", "json"], testRegex: "test/recordings/.*\\.spec\\.ts$", testTimeout: 15000 };
