import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingAnimation } from "./LoadingAnimation";

describe("LoadingAnimation", () => {
  it("renders ferry, orca, and complete states", () => {
    const ferry = renderToStaticMarkup(
      <LoadingAnimation variant="ferry" className="routeLoader" />,
    );
    expect(ferry).toContain(
      "loadingAnimation ferry-loading-animate loadingAnimation--card routeLoader",
    );
    expect(ferry).toContain("ferryLoadingScene__ferry");
    expect(ferry).toContain('aria-hidden="true"');
    expect(ferry).toContain("loadingAnimation__progress");
    expect(ferry).toContain('data-complete="false"');

    const orca = renderToStaticMarkup(
      <LoadingAnimation variant="orca" showProgress={false} />,
    );
    expect(orca).toContain(
      "loadingAnimation orca-loading-animate loadingAnimation--card",
    );
    expect(orca).toContain("orca-mother-calf.png");
    expect(orca).toContain('aria-hidden="true"');
    expect(orca).not.toContain("loadingAnimation__progress");

    const complete = renderToStaticMarkup(
      <LoadingAnimation
        variant="orca"
        label="Loading forecast"
        completeLabel="Forecast ready"
        complete
      />,
    );
    expect(complete).toContain("isComplete");
    expect(complete).toContain('aria-label="Forecast ready"');
    expect(complete).toContain(">Forecast ready<");
    expect(complete).toContain('data-complete="true"');
    expect(complete).not.toContain("Loading forecast");
  });
});
