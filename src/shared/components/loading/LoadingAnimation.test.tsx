import { renderToStaticMarkup } from "react-dom/server";
import { LoadingAnimation } from "./LoadingAnimation";

const assert = {
  includes(value: string, expected: string) {
    if (!value.includes(expected)) throw new Error(`Expected markup to include: ${expected}`);
  },
  excludes(value: string, expected: string) {
    if (value.includes(expected)) throw new Error(`Expected markup to omit: ${expected}`);
  },
};

export function runLoadingAnimationUnitTests() {
  const ferry = renderToStaticMarkup(<LoadingAnimation variant="ferry" className="routeLoader" />);
  assert.includes(ferry, "loadingAnimation ferry-loading-animate loadingAnimation--card routeLoader");
  assert.includes(ferry, "ferryLoadingScene__ferry");
  assert.includes(ferry, 'aria-hidden="true"');
  assert.includes(ferry, "loadingAnimation__progress");
  assert.includes(ferry, 'data-complete="false"');

  const orca = renderToStaticMarkup(<LoadingAnimation variant="orca" showProgress={false} />);
  assert.includes(orca, "loadingAnimation orca-loading-animate loadingAnimation--card");
  assert.includes(orca, "orca-mother-calf.png");
  assert.includes(orca, 'aria-hidden="true"');
  assert.excludes(orca, "loadingAnimation__progress");

  const complete = renderToStaticMarkup(
    <LoadingAnimation variant="orca" label="Loading forecast" completeLabel="Forecast ready" complete />
  );
  assert.includes(complete, "isComplete");
  assert.includes(complete, 'aria-label="Forecast ready"');
  assert.includes(complete, ">Forecast ready<");
  assert.includes(complete, 'data-complete="true"');
  assert.excludes(complete, "Loading forecast");
}
