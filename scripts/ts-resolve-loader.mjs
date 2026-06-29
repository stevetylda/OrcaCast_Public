import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const TS_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

async function fileExists(url) {
  try {
    await access(fileURLToPath(url));
    return true;
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    if (!isRelative || path.extname(specifier)) throw error;
    if (!context.parentURL?.startsWith("file:")) throw error;

    for (const extension of TS_EXTENSIONS) {
      const candidateUrl = new URL(`${specifier}${extension}`, context.parentURL);
      if (await fileExists(candidateUrl)) {
        return {
          shortCircuit: true,
          url: candidateUrl.href,
        };
      }
    }

    throw error;
  }
}

export async function load(url, context, defaultLoad) {
  const pathname = new URL(url).pathname;
  if (!TS_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
    return defaultLoad(url, context, defaultLoad);
  }

  const source = await readFile(fileURLToPath(url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      verbatimModuleSyntax: true,
    },
    fileName: fileURLToPath(url),
  });

  return {
    format: "module",
    shortCircuit: true,
    source: transpiled.outputText,
  };
}
