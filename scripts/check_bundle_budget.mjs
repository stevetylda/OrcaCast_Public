import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const distDirectory = path.resolve("dist");
const manifest = JSON.parse(
  await readFile(path.join(distDirectory, ".vite", "manifest.json"), "utf8"),
);
const entries = Object.values(manifest).filter((item) => item.isEntry);

if (entries.length !== 1) {
  throw new Error(`Expected one application entry, found ${entries.length}.`);
}

const visited = new Set();
const staticFiles = new Set();

function visit(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const item = manifest[key];
  if (!item)
    throw new Error(`Bundle manifest references missing chunk: ${key}`);
  staticFiles.add(item.file);
  for (const cssFile of item.css ?? []) staticFiles.add(cssFile);
  for (const importedKey of item.imports ?? []) visit(importedKey);
}

const entryKey = Object.entries(manifest).find(([, item]) => item.isEntry)?.[0];
if (!entryKey)
  throw new Error("Application entry was not found in the bundle manifest.");
visit(entryKey);

if ([...staticFiles].some((file) => file.includes("map-vendor"))) {
  throw new Error(
    "MapLibre is part of the initial application bundle; keep map routes lazy-loaded.",
  );
}

const budgets = {
  javascript: { raw: 500 * 1024, gzip: 175 * 1024 },
  css: { raw: 250 * 1024, gzip: 40 * 1024 },
};
const totals = {
  javascript: { raw: 0, gzip: 0 },
  css: { raw: 0, gzip: 0 },
};

for (const file of staticFiles) {
  const filePath = path.join(distDirectory, file);
  const bytes = (await stat(filePath)).size;
  const gzipBytes = gzipSync(await readFile(filePath)).byteLength;
  if (file.endsWith(".js")) {
    totals.javascript.raw += bytes;
    totals.javascript.gzip += gzipBytes;
  }
  if (file.endsWith(".css")) {
    totals.css.raw += bytes;
    totals.css.gzip += gzipBytes;
  }
}

for (const [kind, limits] of Object.entries(budgets)) {
  for (const sizeKind of ["raw", "gzip"]) {
    const total = totals[kind][sizeKind];
    const limit = limits[sizeKind];
    if (total > limit) {
      throw new Error(
        `Initial ${kind} bundle is ${(total / 1024).toFixed(1)} kB ${sizeKind}; budget is ${(limit / 1024).toFixed(0)} kB.`,
      );
    }
  }
}

console.log(
  `Initial bundle within budget: ${(totals.javascript.raw / 1024).toFixed(1)}/${(totals.javascript.gzip / 1024).toFixed(1)} kB JS raw/gzip, ${(totals.css.raw / 1024).toFixed(1)}/${(totals.css.gzip / 1024).toFixed(1)} kB CSS raw/gzip.`,
);
