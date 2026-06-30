import { useEffect, useMemo, useRef, useState } from "react";
import type { Period } from "../../../shared/data/periods";
import { isoWeekToDateRange } from "../../../shared/time/forecastPeriodToIsoWeek";

type Speed = 0.5 | 1 | 2;

type Props = {
  periods: Period[];
  selectedIndex: number;
  onChangeIndex: (idx: number) => void;
  isPlaying: boolean;
  onPlayingChange: (value: boolean) => void;
  playDir: 1 | -1;
  onPlayDirChange: (value: 1 | -1) => void;
  rightInsetPx?: number;
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
  if (periods.length <= MAX_VISIBLE_WEEKS) return periods.map((period, index) => ({ period, index }));
  const half = Math.floor(MAX_VISIBLE_WEEKS / 2);
  const start = Math.max(0, Math.min(selectedIndex - half, periods.length - MAX_VISIBLE_WEEKS));
  return periods.slice(start, start + MAX_VISIBLE_WEEKS).map((period, offset) => ({
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
  playDir,
  onPlayDirChange,
}: Props) {
  const [speed] = useState<Speed>(1);
  const selectedRef = useRef(selectedIndex);

  useEffect(() => {
    selectedRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    if (!isPlaying || periods.length === 0) return;
    const id = window.setTimeout(() => {
      const maxIndex = periods.length - 1;
      const next = selectedIndex + playDir;
      if (next < 0 || next > maxIndex) {
        const reversedDir: 1 | -1 = playDir === 1 ? -1 : 1;
        onPlayDirChange(reversedDir);
        const bounced = selectedIndex + reversedDir;
        if (bounced >= 0 && bounced <= maxIndex) onChangeIndex(bounced);
        return;
      }
      onChangeIndex(next);
    }, SPEED_MS[speed]);
    return () => window.clearTimeout(id);
  }, [isPlaying, onChangeIndex, onPlayDirChange, periods.length, playDir, selectedIndex, speed]);

  const visiblePeriods = useMemo(
    () => getVisibleWindow(periods, Math.max(0, selectedIndex)),
    [periods, selectedIndex]
  );

  const handlePlayToggle = () => {
    if (periods.length === 0) return;
    if (isPlaying) {
      onPlayingChange(false);
      return;
    }
    const maxIndex = periods.length - 1;
    onPlayDirChange(selectedIndex >= maxIndex ? -1 : 1);
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
        <div className="weekTimeline__weeks" role="tablist" aria-label="Forecast weeks">
          {visiblePeriods.map(({ period, index }) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={period.periodKey}
                type="button"
                className={`weekTimeline__week${isSelected ? " isSelected" : ""}`}
                onClick={() => onChangeIndex(index)}
                role="tab"
                aria-selected={isSelected}
              >
                <span className="weekTimeline__weekLabel">Week {period.stat_week}</span>
                <span className="weekTimeline__weekDate">{formatWeekDate(period)}</span>
              </button>
            );
          })}
        </div>

        <input
          className="weekTimeline__slider"
          type="range"
          min={0}
          max={Math.max(0, periods.length - 1)}
          step={1}
          value={periods.length === 0 ? 0 : selectedIndex}
          disabled={periods.length === 0}
          onChange={(event) => onChangeIndex(Number(event.target.value))}
          aria-label="Selected forecast week"
        />
      </div>

      <button
        type="button"
        className="weekTimeline__iconBtn weekTimeline__iconBtn--calendar"
        onClick={() => onPlayingChange(false)}
        aria-label="Current weekly forecast selection"
      >
        <span className="material-symbols-rounded" aria-hidden="true">
          calendar_month
        </span>
      </button>
    </div>
  );
}
