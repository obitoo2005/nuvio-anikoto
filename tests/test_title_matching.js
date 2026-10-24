const assert = require("assert");
const {
  scoreTitleMatch,
  scoreBaseTitle,
  findBestAnimeMatch,
  cleanTitle,
  extractSeasonNumber,
  parseSeasonLabel
} = require("../providers/anikoto.js");

function testTitleMatchingUnit() {
  console.log("--> Testing title matching and normalization...");

  assert.strictEqual(cleanTitle("Attack on Titan: Final Season!"), "attack on titan final season");
  assert.strictEqual(cleanTitle("Sousou no Frieren - Marumaru no Mahou (Mini Anime)"), "sousou no frieren marumaru no mahou mini anime");
  assert.strictEqual(cleanTitle("Frieren: Beyond Journey&#039;s End"), "frieren beyond journey s end");

  assert.strictEqual(parseSeasonLabel("Attack on Titan Season 2").season, 2);
  assert.strictEqual(parseSeasonLabel("Sousou no Frieren 2nd Season").season, 2);
  assert.strictEqual(parseSeasonLabel("Attack on Titan: Final Season, Part 2").season, null);
  assert.strictEqual(parseSeasonLabel("Attack on Titan: Final Season, Part 2").part, 2);
  assert.strictEqual(parseSeasonLabel("Attack on Titan: Final Season, Part 2").isFinalSeason, true);
  assert.strictEqual(parseSeasonLabel("Mushoku Tensei: Jobless Reincarnation Part 2").season, null);
  assert.strictEqual(parseSeasonLabel("Mushoku Tensei: Jobless Reincarnation Part 2").part, 2);
  assert.strictEqual(parseSeasonLabel("Season 1, Part 2").season, 1);
  assert.strictEqual(parseSeasonLabel("Season 1, Part 2").part, 2);
  assert.strictEqual(parseSeasonLabel("My Star: Specials").isSpecial, true);

  assert.strictEqual(extractSeasonNumber("Sousou no Frieren 2nd Season"), 2);
  assert.strictEqual(extractSeasonNumber("Final Season Part 3"), null);
  assert.strictEqual(extractSeasonNumber("Bleach"), null);

  assert(Math.abs(scoreBaseTitle("Attack on Titan Season 2", "", "Attack on Titan") - 0.8) < 0.001);
  assert.strictEqual(scoreBaseTitle("Shy Season 2", "", "Attack on Titan"), 0);

  const scoreExact = scoreTitleMatch("Bleach", "", "Bleach", 1);
  assert(scoreExact >= 1.0, "Exact match must have score >= 1.0");

  const aotCandidates = [
    { id: "1631", url: "https://anikoto.cz/watch/attack-on-titan-bgaoa", title: "Attack on Titan" },
    { id: "1385", url: "https://anikoto.cz/watch/attack-on-titan-season-2-0rtbh", title: "Attack on Titan Season 2" },
    { id: "6293", url: "https://anikoto.cz/watch/shy-season-2", title: "Shy Season 2" }
  ];
  const aotMeta = {
    numericId: 1429,
    kind: "tv",
    title: "Attack on Titan",
    originalTitle: "進撃の巨人",
    alternateTitles: [],
    seasonName: "Season 2",
    allSeasons: [
      { season_number: 1, name: "Season 1" },
      { season_number: 2, name: "Season 2" }
    ],
    absoluteOffset: 25
  };
  const aotMatch = findBestAnimeMatch(aotCandidates, aotMeta, 2);
  assert(aotMatch, "Should match Attack on Titan Season 2");
  assert.strictEqual(aotMatch.id, "1385", "Must not match Shy Season 2");

  const mhaCandidates = [
    { id: "65930", url: "https://anikoto.cz/watch/my-hero-academia", title: "My Hero Academia" },
    { id: "1331", url: "https://anikoto.cz/watch/my-hero-academia-2", title: "My Hero Academia 2" },
    { id: "6293", url: "https://anikoto.cz/watch/shy-season-2", title: "Shy Season 2" }
  ];
  const mhaMeta = {
    numericId: 65930,
    kind: "tv",
    title: "My Hero Academia",
    alternateTitles: [],
    seasonName: "Season 2",
    allSeasons: [
      { season_number: 1, name: "Season 1" },
      { season_number: 2, name: "Season 2" }
    ],
    absoluteOffset: 13
  };
  const mhaMatch = findBestAnimeMatch(mhaCandidates, mhaMeta, 2);
  assert(mhaMatch, "Should match My Hero Academia Season 2");
  assert.strictEqual(mhaMatch.id, "1331", "Must not match Shy Season 2");

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
