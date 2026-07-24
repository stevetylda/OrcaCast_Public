import { useEffect, useMemo, useState } from "react";
import type { Period } from "../../../shared/data/periods";
import { isoWeekToDateRange } from "../../../shared/time/forecastPeriodToIsoWeek";

type Speed = 0.5 | 1 | 2;

type Props = {
  periods: Period[];
  selectedIndex: number;
  onChangeIndex: (idx: number) => void;
  isPlaying: boolean;
  onPlayingChange: (value: boolean) => void;
};

const SPEED_MS: Record<Speed, number> = {
  0.5: 2000,
  1: 1200,
  2: 600,
};

const MAX_VISIBLE_WEEKS = 7;

function formatWeekDate(period: Period) {
  const { start } = isoWeekToDateRange(period.year, period.stat_week);
  const date = new Date(`${start}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function getVisibleWindow(periods: Period[], selectedIndex: number) {
  if (periods.length <= MAX_VISIBLE_WEEKS)
    return periods.map((period, index) => ({ period, index }));
  const half = Math.floor(MAX_VISIBLE_WEEKS / 2);
  const start = Math.max(
    0,
    Math.min(selectedIndex - half, periods.length - MAX_VISIBLE_WEEKS),
  );
  return periods
    .slice(start, start + MAX_VISIBLE_WEEKS)
    .map((period, offset) => ({
      period,
      index: start + offset,
    }));
}

export function WeekTimelineBar({
  periods,
  selectedIndex,
  onChangeIndex,
  isPlaying,
  onPlayingChange,
}: Props) {
  const [speed] = useState<Speed>(1);

  useEffect(() => {
    if (!isPlaying || periods.length === 0) return;
    const id = window.setTimeout(() => {
      const maxIndex = periods.length - 1;
      const next = selectedIndex + 1;
      if (next > maxIndex) {
        onPlayingChange(false);
        return;
      }
      onChangeIndex(next);
    }, SPEED_MS[speed]);
    return () => window.clearTimeout(id);
  }, [
    isPlaying,
    onChangeIndex,
    onPlayingChange,
    periods.length,
    selectedIndex,
    speed,
  ]);

  const visiblePeriods = useMemo(
    () => getVisibleWindow(periods, Math.max(0, selectedIndex)),
    [periods, selectedIndex],
  );

  const handlePlayToggle = () => {
    if (periods.length === 0) return;
    if (isPlaying) {
      onPlayingChange(false);
      return;
    }
    const maxIndex = periods.length - 1;
    if (selectedIndex >= maxIndex) onChangeIndex(0);
    onPlayingChange(true);
  };

  return (
    <div className="weekTimeline" data-tour="forecast-period">
      <button
        type="button"
        className="weekTimeline__iconBtn"
        onClick={handlePlayToggle}
        aria-label={isPlaying ? "Pause playback" : "Play weekly forecast"}
      >
        <span className="material-symbols-rounded" aria-hidden="true">
          {isPlaying ? "pause" : "play_arrow"}
        </span>
      </button>

      <div className="weekTimeline__main">
        <div
          className="weekTimeline__weeks"
          role="tablist"
          aria-label="Forecast weeks"
        >
          {visiblePeriods.map(({ period, index }) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={period.periodKey}
                type="button"
                className={`weekTimeline__week${isSelected ? " isSelected" : ""}`}
                onClick={() => onChangeIndex(index)}
                onKeyDown={(event) => {
                  const currentPosition = visiblePeriods.findIndex(
                    (item) => item.index === index,
                  );
                  let nextPosition = currentPosition;
                  if (event.key === "ArrowLeft") nextPosition -= 1;
                  else if (event.key === "ArrowRight") nextPosition += 1;
                  else if (event.key === "Home") nextPosition = 0;
                  else if (event.key === "End")
                    nextPosition = visiblePeriods.length - 1;
                  else return;
                  event.preventDefault();
                  const next =
                    visiblePeriods[
                      Math.max(
                        0,
                        Math.min(visiblePeriods.length - 1, nextPosition),
                      )
                    ];
                  if (!next) return;
                  onChangeIndex(next.index);
                  window.requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLElement>(
                        `[data-forecast-period-index="${next.index}"]`,
                      )
                      ?.focus(),
                  );
                }}
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                data-forecast-period-index={index}
              >
                <span className="weekTimeline__weekLabel">
                  Week {period.stat_week}
                </span>
                <span className="weekTimeline__weekDate">
                  {formatWeekDate(period)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
