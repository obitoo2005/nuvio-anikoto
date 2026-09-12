const assert = require("assert");

function validateStreamSchema(stream) {
  assert(stream, "Stream must not be null/undefined");
  assert.strictEqual(typeof stream.url, "string", "Stream url must be string");
  assert(stream.url.startsWith("http://") || stream.url.startsWith("https://"), "Stream url must be http/https");
  assert.strictEqual(typeof stream.title, "string", "Stream title must be string");
  assert(stream.title.length > 0, "Stream title must not be empty");
  if (stream.quality) {
    assert.strictEqual(typeof stream.quality, "string", "Stream quality must be string");
  }
  if (stream.headers) {
    assert.strictEqual(typeof stream.headers, "object", "Stream headers must be an object");
    for (const [k, v] of Object.entries(stream.headers)) {
      assert.strictEqual(typeof k, "string", "Header key must be string");
      assert.strictEqual(typeof v, "string", "Header value must be string");
    }
  }
  if (stream.subtitles) {
    assert(Array.isArray(stream.subtitles), "Subtitles must be an array");
    for (const sub of stream.subtitles) {
      assert.strictEqual(typeof sub.url, "string", "Subtitle url must be string");
      assert.strictEqual(typeof sub.language, "string", "Subtitle language must be string");
    }
  }
}

module.exports = { validateStreamSchema };
