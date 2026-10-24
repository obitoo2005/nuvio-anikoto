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

function streamPath(stream) {
  return new URL(stream.url).pathname;
}

async function assertEpisodeIdentity(label, request, anikotoId, episode) {
  const [id, type, season, ep] = request;
  const actual = await getStreams(id, type, season, ep);
  assert(actual.length > 0, `${label} should return a stream`);
  const direct = await getStreams(`anikoto:${anikotoId}:${episode}`, "tv", 1, episode);
  assert(direct.length > 0, `${label} direct Anikoto reference should return a stream`);
  assert.strictEqual(
    streamPath(actual[0]),
    streamPath(direct[0]),
    `${label} resolved to the wrong episode`
  );
  console.log(`  [PASS] ${label} -> Anikoto ${anikotoId} episode ${episode}`);
}

async function runRealAnimeTests() {
  console.log("--> Starting Real Anime Integration Tests...");

  console.log("\n[Test A] Popular anime (Frieren S1E1)...");
  const streamsA = await getStreams("209867", "tv", 1, 1);
  assert(streamsA.length > 0, "Test A should return at least one playable stream");
  validateStreamSchema(streamsA[0]);
  await verifyPlayableUrl(streamsA[0]);
  console.log(`  [PASS] Resolved ${streamsA.length} stream(s). Sample: ${streamsA[0].title}`);

  console.log("\n[Test B] Multi-season anime (Attack on Titan S2E3)...");
  const streamsB = await getStreams("1429", "tv", 2, 3);
  assert(streamsB.length > 0, "Test B should return at least one stream");
  validateStreamSchema(streamsB[0]);
  await verifyPlayableUrl(streamsB[0]);
  await assertEpisodeIdentity("Attack on Titan S2E3", ["1429", "tv", 2, 3], "1385", 3);

  console.log("\n[Test C] Alternate titles (Demon Slayer S1E1)...");
  const streamsC = await getStreams("85937", "tv", 1, 1);
  assert(streamsC.length > 0, "Test C should return at least one stream");
  validateStreamSchema(streamsC[0]);
  await verifyPlayableUrl(streamsC[0]);
  console.log(`  [PASS] Resolved ${streamsC.length} stream(s). Sample: ${streamsC[0].title}`);

  console.log("\n[Test D] Movie (Jujutsu Kaisen 0)...");
  const streamsD = await getStreams("810693", "movie", 1, 1);
  assert(streamsD.length > 0, "Test D should return at least one stream");
  validateStreamSchema(streamsD[0]);
  await verifyPlayableUrl(streamsD[0]);
  console.log(`  [PASS] Resolved ${streamsD.length} stream(s). Sample: ${streamsD[0].title}`);

  console.log("\n[Test E] Nonexistent anime...");
  const streamsE = await getStreams("999999999", "tv", 1, 1);
  assert.strictEqual(streamsE.length, 0, "Nonexistent anime must return empty array");
  console.log("  [PASS] Nonexistent anime handled gracefully returning []");

  console.log("\n[Test F] Nonexistent episode...");
  const streamsF = await getStreams("209867", "tv", 1, 999);
  assert.strictEqual(streamsF.length, 0, "Nonexistent episode must return empty array");
  console.log("  [PASS] Nonexistent episode handled gracefully returning []");

  console.log("\n[Test G] Direct catalog search...");
  const searchRes = await search("Naruto");
  assert(searchRes.length > 0, "Search for Naruto should return results");
  console.log(`  [PASS] Search returned ${searchRes.length} items`);

  console.log("\n[Test H] Season and episode identity regressions...");
  await assertEpisodeIdentity("Demon Slayer S2E1", ["85937", "tv", 2, 1], "6871", 1);
  await assertEpisodeIdentity("Demon Slayer S3E1", ["85937", "tv", 3, 1], "7024", 1);
  await assertEpisodeIdentity("Attack on Titan S4E20", ["1429", "tv", 4, 20], "6694", 4);
  await assertEpisodeIdentity("Mushoku Tensei S2E1", ["94664", "tv", 2, 1], "6537", 1);
  await assertEpisodeIdentity("One Piece S21E5", ["37854", "tv", 21, 5], "1642", 896);
  await assertEpisodeIdentity("Frieren S1E29", ["209867", "tv", 1, 29], "8384", 1);
  await assertEpisodeIdentity("Kitsu Attack on Titan S2E3", ["kitsu:8671", "tv", 1, 3], "1385", 3);

  console.log("\n[ALL REAL ANIME TESTS PASSED SUCCESSFULLY]");
}

if (require.main === module) {
  runRealAnimeTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
  });
}

module.exports = { runRealAnimeTests };
