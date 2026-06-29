import { useEffect, useMemo, useRef, useState } from "react";
import type { Period } from "../data/periods";

type Speed = 0.5 | 1 | 2;

type Props = {
  periods: Period[];
  selectedIndex: number;
  onChangeIndex: (idx: number) => void;
  isPlaying: boolean;
  onPlayingChange: (value: boolean) => void;
  playDir: 1 | -1;
  onPlayDirChange: (value: 1 | -1) => void;
  disabled?: boolean;
  tourId?: string;
};

const SPEED_OPTIONS: Array<{ label: string; value: Speed }> = [
  { label: "0.5x", value: 0.5 },
  { label: "1x", value: 1 },
  { label: "2x", value: 2 },
];

const SPEED_MS: Record<Speed, number> = {
  0.5: 2000,
  1: 1200,
  2: 600,
};

export function ForecastPeriodPill({
  periods,
  selectedIndex,
  onChangeIndex,
  isPlaying,
  onPlayingChange,
  playDir,
  onPlayDirChange,
  disabled = false,
  tourId,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [scrubIndex, setScrubIndex] = useState(selectedIndex);
  const [isDragging, setIsDragging] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const selectedRef = useRef(selectedIndex);

  useEffect(() => {
    selectedRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!isPlaying || disabled || periods.length === 0) return;
    const id = window.setTimeout(() => {
      const maxIndex = periods.length - 1;
      const current = selectedIndex;
      const next = current + playDir;
      if (next < 0 || next > maxIndex) {
        const reversedDir: 1 | -1 = playDir === 1 ? -1 : 1;
        onPlayDirChange(reversedDir);
        const bounced = current + reversedDir;
        if (bounced >= 0 && bounced <= maxIndex) {
          onChangeIndex(bounced);
        }
        return;
      }
      onChangeIndex(next);
    }, SPEED_MS[speed]);
    return () => window.clearTimeout(id);
  }, [disabled, isPlaying, onPlayDirChange, playDir, periods.length, selectedIndex, speed, onChangeIndex]);

  const currentLabel = useMemo(() => periods[selectedIndex]?.label ?? "Forecast", [
    periods,
    selectedIndex,
  ]);

  const commitIndex = (idx: number) => {
    if (idx === selectedRef.current) return;
    onChangeIndex(idx);
  };

  const scheduleCommit = (idx: number) => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    debounceRef.current = window.setTimeout(() => {
      commitIndex(idx);
      debounceRef.current = null;
    }, 150);
  };

  const handleSliderChange = (value: number) => {
    setScrubIndex(value);
    scheduleCommit(value);
  };

  const handleSliderCommit = (value: number) => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    commitIndex(value);
  };

  const handlePlayToggle = () => {
    if (periods.length === 0) return;
    if (isPlaying) {
      onPlayingChange(false);
      return;
    }
    const maxIndex = periods.length - 1;
    const dir: 1 | -1 = selectedIndex >= maxIndex ? -1 : 1;
    onPlayDirChange(dir);
    onPlayingChange(true);
  };

  const moveTo = (idx: number) => {
    if (idx < 0 || idx >= periods.length) return;
    commitIndex(idx);
  };

  return (
    <div
      ref={containerRef}
      className={`periodPill${open ? " periodPill--open" : ""}${disabled ? " periodPill--disabled" : ""}`}
      data-tour={tourId}
    >
      <button
        type="button"
        className="periodPill__button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="periodPill__label">Forecast</span>
        <span className="periodPill__value">{currentLabel}</span>
        <span className="material-symbols-rounded periodPill__playIcon" aria-hidden="true">
          play_arrow
        </span>
      </button>

      {open && (
        <div className="periodPopover" role="dialog" aria-label="Forecast period controls">
          <input
            className="periodPopover__slider"
            type="range"
            min={0}
            max={Math.max(0, periods.length - 1)}
            step={1}
            value={periods.length === 0 ? 0 : isDragging ? scrubIndex : selectedIndex}
            disabled={disabled || periods.length === 0}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            onMouseDown={() => {
              setScrubIndex(selectedIndex);
              setIsDragging(true);
            }}
            onMouseUp={(e) => {
              setIsDragging(false);
              handleSliderCommit(Number((e.target as HTMLInputElement).value));
            }}
            onTouchStart={() => {
              setScrubIndex(selectedIndex);
              setIsDragging(true);
            }}
            onTouchEnd={(e) => {
              setIsDragging(false);
              handleSliderCommit(Number((e.target as HTMLInputElement).value));
            }}
            aria-label="Forecast period"
          />

          <div className="periodPopover__controls">
            <button
              type="button"
              className="periodPopover__btn"
              onClick={() => moveTo(0)}
              aria-label="First period"
              disabled={disabled || periods.length === 0}
            >
              <span className="material-symbols-rounded">skip_previous</span>
            </button>
            <button
              type="button"
              className="periodPopover__btn"
              onClick={() => moveTo(selectedIndex - 1)}
              aria-label="Previous period"
              disabled={disabled || periods.length === 0}
            >
              <span className="material-symbols-rounded">chevron_left</span>
            </button>
            <button
              type="button"
              className="periodPopover__btn periodPopover__btn--play"
              onClick={handlePlayToggle}
              aria-label={isPlaying ? "Pause playback" : "Play periods"}
              disabled={disabled || periods.length === 0}
            >
              <span className="material-symbols-rounded">
                {isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>
            <button
              type="button"
              className="periodPopover__btn"
              onClick={() => moveTo(selectedIndex + 1)}
              aria-label="Next period"
              disabled={disabled || periods.length === 0}
            >
              <span className="material-symbols-rounded">chevron_right</span>
            </button>
            <button
              type="button"
              className="periodPopover__btn"
              onClick={() => moveTo(periods.length - 1)}
              aria-label="Last period"
              disabled={disabled || periods.length === 0}
            >
              <span className="material-symbols-rounded">skip_next</span>
            </button>

            <select
              className="periodPopover__speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value) as Speed)}
              aria-label="Playback speed"
              disabled={disabled}
            >
              {SPEED_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
