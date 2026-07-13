import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

const publicRoot = path.resolve("public");
const failures = [];
const references = new Set();
const sourceExtensions = new Set([".ts", ".tsx", ".css", ".html"]);
const referencePattern =
  /(?:src|href)=["'`]\/?([^"'`?#]+)|url\(["']?\/?([^"')?#]+)|["'`](\/(?:images|spot-images|spot-photos)\/[^"'`?#]+)["'`]/g;

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (
      entry.isDirectory() &&
      !["node_modules", "dist", ".git"].includes(entry.name)
    )
      files.push(...(await walk(target)));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

async function existsWithExactCase(relative) {
  let current = publicRoot;
  for (const segment of relative.split("/").filter(Boolean)) {
    const names = await readdir(current).catch(() => []);
    if (!names.includes(segment)) return false;
    current = path.join(current, segment);
  }
  return true;
}

for (const file of await walk(path.resolve("src"))) {
  if (!sourceExtensions.has(path.extname(file))) continue;
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(referencePattern)) {
    const value = match[1] ?? match[2] ?? match[3]?.slice(1);
    if (
      !value ||
      /^(?:data:|https?:|#)/.test(value) ||
      value.startsWith("src/")
    )
      continue;
    references.add(value.replace(/^\//, ""));
  }
}
const indexContent = await readFile(path.resolve("index.html"), "utf8");
for (const match of indexContent.matchAll(referencePattern)) {
  const value = match[1] ?? match[2] ?? match[3]?.slice(1);
  if (value && !/^(?:data:|https?:|#|src\/)/.test(value))
    references.add(value.replace(/^\//, ""));
}

const photoManifest = JSON.parse(
  await readFile(
    path.join(publicRoot, "data/places/viewing_spot_photos.json"),
    "utf8",
  ),
);
for (const item of Object.values(photoManifest)) {
  if (typeof item?.imageSrc === "string" && item.imageSrc.startsWith("/"))
    references.add(item.imageSrc.slice(1));
}

for (const relative of references) {
  if (!(await existsWithExactCase(relative)))
    failures.push(`Missing or case-mismatched public asset: /${relative}`);
}

const publicFiles = await walk(publicRoot);
const parser = new XMLParser({ ignoreAttributes: false });
for (const file of publicFiles.filter((candidate) =>
  candidate.endsWith(".svg"),
)) {
  try {
    const parsed = parser.parse(await readFile(file, "utf8"));
    if (!parsed.svg) throw new Error("root element is not <svg>");
  } catch (error) {
    failures.push(
      `${path.relative(process.cwd(), file)} is invalid SVG: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const budget = JSON.parse(
  await readFile(path.resolve("config/asset-budgets.json"), "utf8"),
);
for (const file of publicFiles) {
  const relative = path.relative(process.cwd(), file);
  const bytes = (await stat(file)).size;
  const limit = budget.allowlistedMaxBytes[relative] ?? budget.defaultMaxBytes;
  if (bytes > limit)
    failures.push(`${relative} is ${bytes} bytes; budget is ${limit}`);
}

if (!references.has("images/OrcaCast-Icon.png"))
  failures.push("index.html must reference the favicon");
if (failures.length) {
  console.error(
    `Static asset validation failed (${failures.length}):\n${failures.join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `Validated ${references.size} references, ${publicFiles.length} files, SVG parsing, exact case, and asset budgets.`,
);
