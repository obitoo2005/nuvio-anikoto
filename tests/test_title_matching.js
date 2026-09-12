const assert = require("assert");
const { scoreTitleMatch, findBestAnimeMatch, cleanTitle, extractSeasonNumber } = require("../providers/anikoto.js");

function testTitleMatchingUnit() {
  console.log("--> Testing title matching and normalization...");

  // 1. Text normalization
  assert.strictEqual(cleanTitle("Attack on Titan: Final Season!"), "attack on titan final season");
  assert.strictEqual(cleanTitle("Sousou no Frieren - Marumaru no Mahou (Mini Anime)"), "sousou no frieren marumaru no mahou mini anime");
  assert.strictEqual(cleanTitle("Frieren: Beyond Journey&#039;s End"), "frieren beyond journey s end");

  // 2. Season number extraction
  assert.strictEqual(extractSeasonNumber("Attack on Titan Season 2"), 2);
  assert.strictEqual(extractSeasonNumber("Sousou no Frieren 2nd Season"), 2);
  assert.strictEqual(extractSeasonNumber("Final Season Part 3"), 3);
  assert.strictEqual(extractSeasonNumber("Bleach"), null);

  // 3. Exact matching scores
  const scoreExact = scoreTitleMatch("Bleach", "", "Bleach", 1);
  assert(scoreExact >= 1.0, "Exact match must have score >= 1.0");

  // 4. Candidate selection
  const candidates = [
    { id: "1057", url: "https://anikoto.cz/watch/bleach-yaa9n", title: "Bleach" },
    { id: "8972", url: "https://anikoto.cz/watch/bleach-thousand-year-blood-war-the-calamity-752db", title: "Bleach: Thousand-Year Blood War - The Calamity" }
  ];
  const metaBleach = {
    numericId: 30984,
    kind: "tv",
    title: "Bleach",
    originalTitle: "BLEACH",
    alternateTitles: [],
    absoluteOffset: 0
  };
  const matched = findBestAnimeMatch(candidates, metaBleach, 1);
  assert(matched, "Should match Bleach");
  assert.strictEqual(matched.id, "1057", "Should match classic Bleach ID 1057");

  console.log("  [PASS] Title matching unit tests passed successfully");
}

if (require.main === module) {
  testTitleMatchingUnit();
}

module.exports = { testTitleMatchingUnit };
