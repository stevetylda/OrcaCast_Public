import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const roots = [
  path.resolve("dist"),
  path.resolve("src"),
  path.resolve("public"),
];
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["npm access token", /\bnpm_[A-Za-z0-9]{36}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Stripe live secret", /\bsk_live_[0-9A-Za-z]{16,}\b/],
  ["GitLab token", /\bglpat-[A-Za-z0-9_-]{20,}\b/],
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

const files = (await Promise.all(roots.map((root) => walk(root)))).flat();
for (const file of files) {
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
  "Application source, public assets, and production bundle contain no recognized private credential patterns.",
);
