import { runExplainabilityUnitTests } from "../src/features/explainability/utils.test.ts";
import { runDeltaMapUnitTests } from "../src/map/deltaMap.test.ts";
import { runH3UnitTests } from "../src/data/h3.test.ts";
import { runFetchClientUnitTests } from "../src/data/fetchClient.test.ts";
import { runCompareSourcesUnitTests } from "../src/pages/MapPage/compareSources.test.ts";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: TestCase[] = [
  { name: "deltaMap", run: runDeltaMapUnitTests },
  { name: "explainability utils", run: runExplainabilityUnitTests },
  { name: "H3 helpers", run: runH3UnitTests },
  { name: "fetchClient", run: runFetchClientUnitTests },
  { name: "compare sources", run: runCompareSourcesUnitTests },
];

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
