export function OrcaLoadingScene() {
  return (
    <div
      className="loadingAnimation__scene loadingAnimation__scene--orca"
      aria-hidden="true"
    >
      <span className="orcaLoadingScene__cloud orcaLoadingScene__cloud--one" />
      <span className="orcaLoadingScene__cloud orcaLoadingScene__cloud--two" />
      <span className="orcaLoadingScene__sparkle orcaLoadingScene__sparkle--one" />
      <span className="orcaLoadingScene__sparkle orcaLoadingScene__sparkle--two" />
      <span className="orcaLoadingScene__glow" />
      <div className="orcaLoadingScene__drift">
        <img
          className="orcaLoadingScene__pair"
          src="/images/loaders/orca-mother-calf.png"
          alt=""
        />
      </div>
      <span className="orcaLoadingScene__waterline" />
      <span className="orcaLoadingScene__splash orcaLoadingScene__splash--one" />
      <span className="orcaLoadingScene__splash orcaLoadingScene__splash--two" />
    </div>
  );
}
