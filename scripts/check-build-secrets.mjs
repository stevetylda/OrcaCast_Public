import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("dist");
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["Cloudflare API token variable", /CLOUDFLARE_API_TOKEN/],
];
const textExtensions = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".map",
  ".txt",
  ".xml",
  ".svg",
]);
const failures = [];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else files.push(target);
  }
  return files;
}

for (const file of await walk(root)) {
  if (!textExtensions.has(path.extname(file))) continue;
  const content = await readFile(file, "utf8");
  for (const [label, pattern] of patterns) {
    if (pattern.test(content))
      failures.push(`${path.relative(process.cwd(), file)} contains ${label}`);
  }
}
if (failures.length) {
  console.error(
    `Production bundle secret scan failed:\n${failures.join("\n")}`,
  );
  process.exit(1);
}
console.log(
  "Production bundle contains no recognized private credential patterns.",
);
