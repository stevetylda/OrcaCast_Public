import { computeDeltaPercentilesByCell, computePercentileRanks } from "./deltaMap";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertClose(actual: number, expected: number, epsilon = 1e-9) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

export function runDeltaMapUnitTests() {
  // Ordered values -> ordered percentiles in [0, 1].
  {
    const p = computePercentileRanks({ a: 1, b: 2, c: 3 }, ["a", "b", "c"]);
    assertClose(p.a, 0);
    assertClose(p.b, 0.5);
    assertClose(p.c, 1);
  }

  // Ties use average-rank percentile.
  {
    const p = computePercentileRanks({ a: 5, b: 5, c: 9 }, ["a", "b", "c"]);
    assertClose(p.a, 0.25);
    assertClose(p.b, 0.25);
    assertClose(p.c, 1);
  }

  // N <= 1 uses neutral percentile.
  {
    const p = computePercentileRanks({ solo: 42 }, ["solo"]);
    assertClose(p.solo, 0.5);
  }

  // Missing cells in one layer are treated as zero before ranking.
  {
    const result = computeDeltaPercentilesByCell(
      { a: 10 }, // b missing => 0
      { b: 10 }, // a missing => 0
      ["a", "b"]
    );
    assertClose(result.deltaByCell.a, 1);
    assertClose(result.deltaByCell.b, -1);
  }

  // Identical layers produce neutral deltas.
  {
    const result = computeDeltaPercentilesByCell(
      { a: 4, b: 4, c: 4 },
      { a: 4, b: 4, c: 4 },
      ["a", "b", "c"]
    );
    assert(Object.values(result.deltaByCell).every((value) => Math.abs(value) < 1e-9), "Expected all deltas to be neutral");
  }
}
