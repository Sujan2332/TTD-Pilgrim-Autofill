// Runs every *.test.js in this folder, each in its own Node process (fake pages keep timers running, which
// would slow the next file down). Usage: npm test   (from tests/, or `npm test --prefix tests` from the root)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith(".test.js")).sort();
let failedFiles = 0;
for (const file of files) {
  console.log(`\n${file}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: "inherit" });
  if (result.status !== 0) failedFiles++;
}
console.log(failedFiles ? `\n${failedFiles} of ${files.length} test file(s) FAILED` : `\nAll ${files.length} test files passed.`);
process.exit(failedFiles ? 1 : 0);
