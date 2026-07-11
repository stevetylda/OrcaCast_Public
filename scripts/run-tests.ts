import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

async function collectTestFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const testFiles: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      testFiles.push(...(await collectTestFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      testFiles.push(entryPath);
    }
  }

  return testFiles;
}

async function loadTests(): Promise<TestCase[]> {
  const srcDirectory = path.resolve("src");
  const testFiles = (await collectTestFiles(srcDirectory)).sort();
  const tests: TestCase[] = [];

  for (const testFile of testFiles) {
    const moduleUrl = pathToFileURL(testFile).href;
    const testModule = await import(moduleUrl);

    for (const [exportName, exportedValue] of Object.entries(testModule)) {
      if (!/^run.+UnitTests$/.test(exportName) || typeof exportedValue !== "function") {
        continue;
      }

      tests.push({
        name: path.relative(process.cwd(), testFile),
        run: exportedValue as () => void | Promise<void>,
      });
    }
  }

  return tests;
}

const tests = await loadTests();

if (tests.length === 0) {
  console.error("No test suites were discovered. Add at least one exported run*UnitTests function.");
  process.exitCode = 1;
}

let failures = 0;

for (const testCase of tests) {
  try {
    await testCase.run();
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${testCase.name}`);
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  }
}

if (failures > 0) {
  process.exitCode = 1;
  console.error(`${failures} test suite(s) failed.`);
} else {
  console.log(`${tests.length} test suite(s) passed.`);
}
