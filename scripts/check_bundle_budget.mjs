import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const distDirectory = path.resolve("dist");
const manifest = JSON.parse(
  await readFile(path.join(distDirectory, ".vite", "manifest.json"), "utf8")
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
  if (!item) throw new Error(`Bundle manifest references missing chunk: ${key}`);
  staticFiles.add(item.file);
  for (const cssFile of item.css ?? []) staticFiles.add(cssFile);
  for (const importedKey of item.imports ?? []) visit(importedKey);
}

const entryKey = Object.entries(manifest).find(([, item]) => item.isEntry)?.[0];
if (!entryKey) throw new Error("Application entry was not found in the bundle manifest.");
visit(entryKey);

if ([...staticFiles].some((file) => file.includes("map-vendor"))) {
  throw new Error("MapLibre is part of the initial application bundle; keep map routes lazy-loaded.");
}

const budgets = {
  javascript: 300 * 1024,
  css: 250 * 1024,
};
const totals = { javascript: 0, css: 0 };

for (const file of staticFiles) {
  const bytes = (await stat(path.join(distDirectory, file))).size;
  if (file.endsWith(".js")) totals.javascript += bytes;
  if (file.endsWith(".css")) totals.css += bytes;
}

for (const [kind, limit] of Object.entries(budgets)) {
  if (totals[kind] > limit) {
    throw new Error(
      `Initial ${kind} bundle is ${(totals[kind] / 1024).toFixed(1)} kB; budget is ${(limit / 1024).toFixed(0)} kB.`
    );
  }
}

console.log(
  `Initial bundle within budget: ${(totals.javascript / 1024).toFixed(1)} kB JS, ${(totals.css / 1024).toFixed(1)} kB CSS.`
);
