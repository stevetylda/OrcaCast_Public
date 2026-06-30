import React, { useEffect, useState } from "react";
import { PageShell } from "../../shared/components/PageShell";
import { appConfig } from "../../shared/config/appConfig";
import { getCachedDataMeta, loadDataMeta, type DataMeta } from "../../shared/data/meta";

const responsibleViewingLinks = [
  {
    label: "WDFW orca guidance",
    href: "https://wdfw.wa.gov/species-habitats/at-risk/species-recovery/orca/regulations",
  },
  {
    label: "NOAA whale watching",
    href: "https://www.fisheries.noaa.gov/west-coast/marine-mammal-protection/safe-whale-watching-west-coast-be-whale-wise",
  },
  {
    label: "Be Whale Wise",
    href: "https://www.bewhalewise.org/",
  },
];

export function AboutPage() {
  const [dataMeta, setDataMeta] = useState<DataMeta | null>(() => getCachedDataMeta());

  useEffect(() => {
    let active = true;
    loadDataMeta()
      .then((meta) => {
        if (active) setDataMeta(meta);
      })
      .catch(() => {
        if (active) setDataMeta(null);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PageShell
      title="About"
      fullBleed
      showBottomRail={false}
      showFooter={false}
      stageClassName="pageStage--about"
    >
      <div
        className="aboutBg"
        style={
          {
            "--about-bg-url": "url('/images/about/StephenWalker_Image.jpg')",
          } as React.CSSProperties
        }
      >
        <div className="aboutOverlay" aria-hidden="true" />

        <div className="aboutContent">
          <div className="aboutSheet">
            <section className="aboutSection">
              <h2>OrcaCast helps you know where to look</h2>
              <p>
                OrcaCast is a shore-first whale-watching guide for the Salish Sea. It combines
                forecasted whale-viewing opportunity, shoreline visibility, viewing conditions, and
                live resources to help people decide <strong>where</strong> and <strong>when</strong>{" "}
                it may be worth watching.
              </p>
              <p className="aboutSubtle">
                The public app is designed for simple decisions: check today’s outlook, choose a
                promising shore location, see what water is visible from that location, and open live
                cameras or listening resources when available.
              </p>

              <ul className="aboutPills" aria-label="OrcaCast principles">
                <li className="aboutPill">Shore-first</li>
                <li className="aboutPill">Forecast zones</li>
                <li className="aboutPill">Viewing conditions</li>
                <li className="aboutPill">Live lookouts</li>
                <li className="aboutPill">Not whale tracking</li>
              </ul>
            </section>

            <div className="aboutDivider" />

            <section className="aboutSection">
              <div className="aboutCallout" role="note" aria-label="Forecast zones not whale pins">
                <span className="material-symbols-rounded aboutCalloutIcon" aria-hidden="true">
                  travel_explore
                </span>
                <div className="aboutCalloutText">
                  <strong>Forecast zones, not whale pins.</strong> OrcaCast does not show real-time
                  whale locations and does not guarantee sightings. A high viewing opportunity means
                  the forecast, viewability, and conditions are more favorable, not that whales will
                  definitely be present.
                </div>
              </div>
            </section>

            <div className="aboutDivider" />

            <section className="aboutSection">
              <h2>What you can do with OrcaCast</h2>
              <ul className="aboutBullets">
                <li>See a simple whale-viewing outlook for today or the week ahead.</li>
                <li>Find recommended shore-based viewing locations.</li>
                <li>Open a location card to see viewing potential, conditions, and visible water.</li>
                <li>Use live camera and hydrophone links when they are available.</li>
                <li>Plan a low-impact viewing outing from shore or online.</li>
              </ul>
            </section>

            <div className="aboutDivider" />

            <section className="aboutSection">
              <h2>How it works</h2>
              <p className="aboutSubtle">
                OrcaCast blends historical whale activity patterns, forecasted likelihood, shoreline
                viewability, weather, daylight, and live-viewing resources into simple public labels
                such as <strong>High</strong>, <strong>Medium</strong>, and <strong>Low</strong>.
              </p>
              <p className="aboutSubtle">
                The goal is to translate complex geospatial signals into practical guidance without
                exposing raw model layers in the public experience.
              </p>
            </section>

            <div className="aboutDivider" />

            <section className="aboutSection">
              <h2>What OrcaCast is not</h2>
              <ul className="aboutBullets">
                <li>Not a real-time whale tracking system.</li>
                <li>Not a guarantee that whales will be visible.</li>
                <li>Not a vessel routing, navigation, enforcement, or safety tool.</li>
                <li>Not a replacement for official whale-viewing rules or local guidance.</li>
              </ul>
            </section>

            <div className="aboutDivider" />

            <section className="aboutSection">
              <h2>Watch responsibly</h2>
              <p className="aboutSubtle">
                OrcaCast encourages people to watch from shore or online whenever possible. If you
                are on the water, follow current local, state, federal, and regional rules. Give
                whales space, avoid approaching or following them, and never use forecast information
                to intercept wildlife.
              </p>
              <ul className="aboutPills" aria-label="Responsible viewing resources">
                {responsibleViewingLinks.map((link) => (
                  <li key={link.href}>
                    <a className="aboutPill" href={link.href} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <div className="aboutDivider" />

            <section className="aboutSection">
              <h2>Limitations</h2>
              <p className="aboutSubtle">
                OrcaCast is probabilistic. It can help identify promising viewing opportunities, but
                the ocean is dynamic and whale activity can shift quickly.
              </p>
              <ul className="aboutBullets">
                <li>Sighting and reporting data are uneven across seasons, weather, and locations.</li>
                <li>Popular shorelines and high-traffic areas may be overrepresented in reports.</li>
                <li>Weather, fog, glare, wind, and waves can affect whether whales are visible.</li>
                <li>A low forecast does not mean whales are absent.</li>
                <li>A high forecast does not mean a sighting is guaranteed.</li>
              </ul>
            </section>

            <div className="aboutDivider" />

            <section className="aboutSection">
              <h2>For analysts and collaborators</h2>
              <p className="aboutSubtle">
                The public app is intentionally streamlined. Deeper model diagnostics, raw forecast
                grids, viewability components, and technical layers belong in a separate analyst
                experience.
              </p>

              <details className="aboutDetails">
                <summary className="aboutSummary">View technical metadata</summary>
                <div className="aboutModelGrid" role="group" aria-label="Technical metadata">
                  <div className="aboutModelCard">
                    <span className="aboutModelLabel">Model</span>
                    <strong>{appConfig.compositeModelLabel}</strong>
                    <span className="aboutModelMeta">{appConfig.compositeModelId}</span>
                  </div>
                  <div className="aboutModelCard">
                    <span className="aboutModelLabel">Version</span>
                    <strong>{appConfig.modelVersion}</strong>
                  </div>
                  {dataMeta ? (
                    <div
                      className="aboutModelCard"
                      title={
                        dataMeta.generated_at
                          ? `Generated ${dataMeta.generated_at}`
                          : "Dataset metadata"
                      }
                    >
                      <span className="aboutModelLabel">Data</span>
                      <strong>{dataMeta.data_version}</strong>
                      {dataMeta.generated_at ? (
                        <span className="aboutModelMeta">Generated {dataMeta.generated_at}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </details>
            </section>

            <div className="aboutDivider" />

            <section className="aboutSection">
              <h2>Feedback</h2>
              <p className="aboutSubtle">
                OrcaCast is still developing. Feedback is especially useful when a live feed is
                broken, a location needs better access details, a forecast explanation is confusing,
                or you are interested in collaborating responsibly.
              </p>
              <p className="aboutSubtle">
                The north star is simple: <strong>better whale watching should also mean better whale
                stewardship.</strong>
              </p>
            </section>
          </div>

          <div className="aboutPhotoCredit" role="contentinfo" aria-label="Background photo credit">
            <span className="material-symbols-rounded" aria-hidden="true">
              photo_camera
            </span>
            <span>
              Background photo: <strong>Stephen Walker</strong>
            </span>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
