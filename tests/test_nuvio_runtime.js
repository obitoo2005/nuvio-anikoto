const fs = require("fs");
const path = require("path");
const assert = require("assert");

async function testNuvioRuntimeHarness() {
  console.log("--> Testing Nuvio QuickJS evaluation harness...");
  const providerCode = fs.readFileSync(path.join(__dirname, "..", "providers", "anikoto.js"), "utf8");

  // This matches Nuvio's exact wrapPluginModule implementation in PluginRuntime.kt
  const wrappedCode = `
    var module = { exports: {} };
    var exports = module.exports;
    (function() {
      ${providerCode}
    })();
    return module.exports;
  `;

  const exportsObj = new Function(wrappedCode)();
  assert(exportsObj, "Module exports must be defined");
  assert.strictEqual(typeof exportsObj.getStreams, "function", "getStreams must be exported as a function");
  assert.strictEqual(typeof exportsObj.search, "function", "search must be exported as a function");

  console.log("  [PASS] Provider successfully loads within Nuvio module wrapping environment");
  return exportsObj;
}

if (require.main === module) {
  testNuvioRuntimeHarness().catch(console.error);
}

module.exports = { testNuvioRuntimeHarness };
