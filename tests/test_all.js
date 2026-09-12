const { testManifest } = require("./test_manifest.js");
const { testTitleMatchingUnit } = require("./test_title_matching.js");
const { testNuvioRuntimeHarness } = require("./test_nuvio_runtime.js");
const { runRealAnimeTests } = require("./test_real_anime.js");

async function main() {
  console.log("==================================================");
  console.log("   RUNNING FULL TEST SUITE FOR NUVIO ANIKOTO      ");
  console.log("==================================================");

  testManifest();
  testTitleMatchingUnit();
  await testNuvioRuntimeHarness();
  await runRealAnimeTests();

  console.log("==================================================");
  console.log("   ALL TEST SUITES COMPLETED SUCCESSFULLY!        ");
  console.log("==================================================");
}

main().catch(err => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
