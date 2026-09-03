// Run every UAT suite.
//
//   RDS_ENV=uat node scripts/tests/run-all.js
//   RDS_ENV=uat node scripts/tests/run-all.js rent-start waivers   # just these
//
// Needs `npm run dev` on :3000 (or TEST_BASE_URL). Refuses to touch production.
const fs = require("fs");
const path = require("path");
const { BASE } = require("./_harness");

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));

(async () => {
  const files = fs.readdirSync(__dirname)
    .filter((f) => f.endsWith(".test.js"))
    .filter((f) => !only.length || only.some((o) => f.startsWith(o)))
    .sort();

  if (!files.length) {
    console.error(only.length ? `No suite matches: ${only.join(", ")}` : "No suites found.");
    process.exit(1);
  }

  // Fail loudly and early rather than reporting every suite as broken.
  try {
    const res = await fetch(`${BASE}/login`);
    if (!res.ok) throw new Error(String(res.status));
  } catch (e) {
    console.error(`Cannot reach ${BASE} — start the dev server first (npm run dev). ${e.message}`);
    process.exit(1);
  }

  const results = [];
  for (const file of files) {
    const name = file.replace(".test.js", "");
    console.log(`\n── ${name} ${"─".repeat(Math.max(0, 60 - name.length))}`);
    try {
      results.push(await require(path.join(__dirname, file))());
    } catch (e) {
      console.error("  SUITE CRASHED:", e.message);
      results.push({ name, pass: 0, fail: 1, failures: ["suite crashed: " + e.message] });
    }
  }

  const pass = results.reduce((s, r) => s + r.pass, 0);
  const fail = results.reduce((s, r) => s + r.fail, 0);
  console.log(`\n${"═".repeat(64)}`);
  for (const r of results) {
    console.log(`  ${r.fail ? "FAIL" : " ok "}  ${r.name.padEnd(18)} ${r.pass} passed${r.fail ? `, ${r.fail} FAILED` : ""}`);
    r.failures.forEach((f) => console.log(`          · ${f}`));
  }
  console.log(`${"═".repeat(64)}\n  ${pass} passed, ${fail} failed across ${results.length} suite(s)\n`);
  process.exit(fail ? 1 : 0);
})();
