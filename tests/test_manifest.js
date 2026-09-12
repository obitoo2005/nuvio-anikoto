const fs = require("fs");
const path = require("path");
const assert = require("assert");

function testManifest() {
  console.log("--> Testing manifest.json validity...");
  const manifestPath = path.join(__dirname, "..", "manifest.json");
  assert(fs.existsSync(manifestPath), "manifest.json must exist at root");

  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(raw);

  assert.strictEqual(typeof manifest.name, "string", "Manifest name must be string");
  assert.strictEqual(typeof manifest.version, "string", "Manifest version must be string");
  assert(Array.isArray(manifest.scrapers), "Manifest scrapers must be an array");
  assert(manifest.scrapers.length > 0, "Manifest scrapers must not be empty");

  const scraper = manifest.scrapers[0];
  assert.strictEqual(scraper.id, "anikoto", "Scraper ID must be anikoto");
  assert.strictEqual(typeof scraper.name, "string", "Scraper name must be string");
  assert.strictEqual(typeof scraper.version, "string", "Scraper version must be string");
  assert.strictEqual(typeof scraper.filename, "string", "Scraper filename must be string");
  assert(Array.isArray(scraper.supportedTypes), "supportedTypes must be array");
  assert(scraper.supportedTypes.includes("tv"), "supportedTypes must support tv");
  assert(scraper.supportedTypes.includes("movie"), "supportedTypes must support movie");
  assert.strictEqual(scraper.enabled, true, "enabled must be true");

  const providerFilePath = path.join(__dirname, "..", scraper.filename);
  assert(fs.existsSync(providerFilePath), `Provider file specified in manifest (${scraper.filename}) must exist`);

  console.log("  [PASS] manifest.json is fully valid and points to existent provider file: " + scraper.filename);
}

if (require.main === module) {
  testManifest();
}

module.exports = { testManifest };
