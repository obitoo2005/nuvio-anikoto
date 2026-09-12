const assert = require("assert");
const { getStreams, search } = require("../providers/anikoto.js");
const { validateStreamSchema } = require("./test_stream_schema.js");

async function verifyPlayableUrl(stream) {
  const res = await fetch(stream.url, {
    headers: stream.headers || { "User-Agent": "Mozilla/5.0" }
  });
  assert.strictEqual(res.status, 200, `Stream URL ${stream.url} returned status ${res.status}`);
  const text = await res.text();
  assert(text.includes("#EXTM3U"), "HLS stream must return valid #EXTM3U playlist");
  return true;
}

async function runRealAnimeTests() {
  console.log("--> Starting Real Anime Integration Tests...");

  // Test A: Popular anime (Frieren S1E1)
  console.log("\n[Test A] Popular anime (Frieren S1E1)...");
  const streamsA = await getStreams("209867", "tv", 1, 1);
  assert(streamsA.length > 0, "Test A should return at least one playable stream");
  validateStreamSchema(streamsA[0]);
  await verifyPlayableUrl(streamsA[0]);
  console.log(`  [PASS] Resolved ${streamsA.length} stream(s). Sample: ${streamsA[0].title}`);

  // Test B: Multi-season anime (Attack on Titan S2E3)
  console.log("\n[Test B] Multi-season anime (Attack on Titan S2E3)...");
  const streamsB = await getStreams("1429", "tv", 2, 3);
  assert(streamsB.length > 0, "Test B should return at least one stream");
  validateStreamSchema(streamsB[0]);
  await verifyPlayableUrl(streamsB[0]);
  console.log(`  [PASS] Resolved ${streamsB.length} stream(s). Sample: ${streamsB[0].title}`);

  // Test C: Anime with alternate titles (Demon Slayer S1E1)
  console.log("\n[Test C] Alternate titles (Demon Slayer: Kimetsu no Yaiba S1E1)...");
  const streamsC = await getStreams("85937", "tv", 1, 1);
  assert(streamsC.length > 0, "Test C should return at least one stream");
  validateStreamSchema(streamsC[0]);
  await verifyPlayableUrl(streamsC[0]);
  console.log(`  [PASS] Resolved ${streamsC.length} stream(s). Sample: ${streamsC[0].title}`);

  // Test D: Movie (Jujutsu Kaisen 0)
  console.log("\n[Test D] Movie / Special (Jujutsu Kaisen 0 Movie)...");
  const streamsD = await getStreams("810693", "movie", 1, 1);
  assert(streamsD.length > 0, "Test D should return at least one stream");
  validateStreamSchema(streamsD[0]);
  await verifyPlayableUrl(streamsD[0]);
  console.log(`  [PASS] Resolved ${streamsD.length} stream(s). Sample: ${streamsD[0].title}`);

  // Test E: Nonexistent anime (should return [])
  console.log("\n[Test E] Nonexistent anime (graceful error handling)...");
  const streamsE = await getStreams("999999999", "tv", 1, 1);
  assert.strictEqual(streamsE.length, 0, "Nonexistent anime must return empty array");
  console.log("  [PASS] Nonexistent anime handled gracefully returning []");

  // Test F: Nonexistent episode (should return [])
  console.log("\n[Test F] Nonexistent episode (graceful error handling)...");
  const streamsF = await getStreams("209867", "tv", 1, 999);
  assert.strictEqual(streamsF.length, 0, "Nonexistent episode must return empty array");
  console.log("  [PASS] Nonexistent episode handled gracefully returning []");

  // Test G: Search capability
  console.log("\n[Test G] Direct catalog search...");
  const searchRes = await search("Naruto");
  assert(searchRes.length > 0, "Search for Naruto should return results");
  console.log(`  [PASS] Search returned ${searchRes.length} items`);

  console.log("\n[ALL REAL ANIME TESTS PASSED SUCCESSFULLY]");
}

if (require.main === module) {
  runRealAnimeTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
  });
}

module.exports = { runRealAnimeTests };
