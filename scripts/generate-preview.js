// Injects the exact plugin CSS (from lib/client.js) into docs/preview.html.
// The style block between the __PVT_CSS_START__ / __PVT_CSS_END__ markers is
// replaced on every run, so screenshots always match the shipped bundle.
// Usage: node scripts/generate-preview.js
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "lib", "client.js"), "utf8");
const m = src.match(/const css = \[([\s\S]*?)\n    \]\.join\("\\n"\);/);
if (!m) {
  console.error("css array not found in lib/client.js");
  process.exit(1);
}
const entries = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => JSON.parse(`"${x[1]}"`));
const css = entries.join("\n");
const htmlPath = join(root, "docs", "preview.html");
const html = readFileSync(htmlPath, "utf8");
const out = html.replace(
  /\/\* __PVT_CSS_START__ \*\/[\s\S]*?\/\* __PVT_CSS_END__ \*\//,
  `/* __PVT_CSS_START__ */\n${css}\n/* __PVT_CSS_END__ */`
);
writeFileSync(htmlPath, out);
console.log(`injected ${entries.length} css rules, ${css.length} chars`);
