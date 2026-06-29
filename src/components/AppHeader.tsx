import { useState } from "react";
import type { H3Resolution } from "../config/dataPaths";
import type { Period } from "../data/periods";
import { ExpectedActivityPill } from "./ExpectedActivityPill";
import { ForecastPeriodPill } from "./ForecastPeriodPill";
import { H3ResolutionPill } from "./controls/H3ResolutionPill";

type Resolution = H3Resolution;

type Props = {
  title: string;
  subtitle: string;
  forecastPeriods: Period[];
  forecastIndex: number;
  onForecastIndexChange: (idx: number) => void;
  forecastPlaybackPlaying: boolean;
  onForecastPlaybackPlayingChange: (value: boolean) => void;
  forecastPlaybackDirection: 1 | -1;
  onForecastPlaybackDirectionChange: (value: 1 | -1) => void;
  expectedActivityCount: number | null;
  expectedActivityVsPriorWeek: number | null;
  expectedActivityVs12WeekAvg: number | null;
  expectedActivityTrend: "up" | "down" | "steady" | "none";
  expectedActivityChart: {
    actualValues: Array<number | null>;
    forecastValues: Array<number | null>;
    forecastValue: number | null;
    predictionIndex: number;
  };
  showForecastNotice?: boolean;
  forecastNoticeText?: string;
  fallbackNoticeVisible?: boolean;
  fallbackNoticeText?: string;
  resolution: Resolution;
  onResolutionChange: (v: Resolution) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenInfo: () => void;
  onOpenMenu: () => void;
  onBrandClick?: () => void;
  compareEnabled?: boolean;
  onExitCompareMode?: () => void;
};

export function AppHeader({
  title,
  subtitle,
  forecastPeriods,
  forecastIndex,
  onForecastIndexChange,
  forecastPlaybackPlaying,
  onForecastPlaybackPlayingChange,
  forecastPlaybackDirection,
  onForecastPlaybackDirectionChange,
  expectedActivityCount,
  expectedActivityVsPriorWeek,
  expectedActivityVs12WeekAvg,
  expectedActivityTrend,
  expectedActivityChart,
  showForecastNotice = false,
  forecastNoticeText = "Forecast data is not available for the selected period.",
  fallbackNoticeVisible = false,
  fallbackNoticeText = "Selected period unavailable - showing latest available",
  resolution,
  onResolutionChange,
  darkMode,
  onToggleDarkMode,
  onOpenInfo,
  onOpenMenu,
  onBrandClick,
  compareEnabled = false,
  onExitCompareMode,
}: Props) {
  const [compareModeHovered, setCompareModeHovered] = useState(false);

  return (
    <header className="header" data-tour="top-bar">
      <div className="header__left">
        <button
          className="iconBtn iconBtn--menu"
          onClick={onOpenMenu}
          aria-label="Menu"
          data-tour="menu"
        >
          <span className="material-symbols-rounded">menu</span>
        </button>

        <button
          type="button"
          className={`brand brandBtn${onBrandClick ? " brandBtn--active" : ""}`}
          onClick={onBrandClick}
          aria-label={onBrandClick ? "Reset map" : undefined}
          title={onBrandClick ? "Reset map" : undefined}
        >
          <div className="brand__title">
            {title} <span className="brand__subtitle">– {subtitle}</span>
          </div>
        </button>
      </div>

      <div className="header__right">
        {compareEnabled ? (
          <button
            type="button"
            className="compareModePill compareModePill--button"
            aria-label="Exit compare mode"
            onClick={onExitCompareMode}
            onMouseEnter={() => setCompareModeHovered(true)}
            onMouseLeave={() => setCompareModeHovered(false)}
            onFocus={() => setCompareModeHovered(true)}
            onBlur={() => setCompareModeHovered(false)}
          >
            {compareModeHovered ? "EXIT" : "COMPARE MODE"}
          </button>
        ) : (
          <>
            <div className="headerForecast">
              <ForecastPeriodPill
                periods={forecastPeriods}
                selectedIndex={forecastIndex}
                onChangeIndex={onForecastIndexChange}
                isPlaying={forecastPlaybackPlaying}
                onPlayingChange={onForecastPlaybackPlayingChange}
                playDir={forecastPlaybackDirection}
                onPlayDirChange={onForecastPlaybackDirectionChange}
                disabled={forecastPeriods.length === 0}
                tourId="forecast-period"
              />
              <div
                className={`headerForecast__notice${showForecastNotice ? " is-visible" : ""}`}
                role="status"
                aria-live="polite"
              >
                {forecastNoticeText}
              </div>
              {fallbackNoticeVisible && (
                <div className="headerForecast__fallback" role="status" aria-live="polite">
                  <span className="material-symbols-rounded" aria-hidden="true">
                    history
                  </span>
                  <span>{fallbackNoticeText}</span>
                </div>
              )}
            </div>

            <ExpectedActivityPill
              currentCount={expectedActivityCount}
              vsPriorWeek={expectedActivityVsPriorWeek}
              vs12WeekAvg={expectedActivityVs12WeekAvg}
              trend={expectedActivityTrend}
              chart={expectedActivityChart}
            />
          </>
        )}

        {!compareEnabled && (
          <H3ResolutionPill
            value={resolution === "H4" ? 4 : resolution === "H5" ? 5 : 6}
            onChange={(next) =>
              onResolutionChange(next === 4 ? "H4" : next === 5 ? "H5" : "H6")
            }
            tourId="resolution"
          />
        )}

        <button
          className="iconBtn"
          onClick={onToggleDarkMode}
          aria-label="Toggle dark mode"
          title="Dark/Light Mode"
          data-tour="theme-toggle"
        >
          <span className="material-symbols-rounded">
            {darkMode ? "light_mode" : "dark_mode"}
          </span>
        </button>

        <button
          className="iconBtn"
          onClick={onOpenInfo}
          aria-label="Info"
          data-tour="info"
        >
          <span className="material-symbols-rounded">info</span>
        </button>
      </div>
    </header>
  );
}
