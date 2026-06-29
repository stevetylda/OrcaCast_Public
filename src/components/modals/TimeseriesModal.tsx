import { useEffect, useRef, useState } from "react";
import type { H3Resolution } from "../../config/dataPaths";
import { FORECAST_PATH_LATEST_WEEKLY } from "../../config/dataPaths";
import { isoWeekFromDate } from "../../core/time/forecastPeriodToIsoWeek";
import { WeeklySightingActivitySvg } from "../charts/WeeklySightingActivitySvg";

type Row = {
  decade: number;
  stat_week: number;
  active_grids: number;
};

type Payload = {
  ecotype: string;
  rows: Row[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
  currentWeek: number;
  forecastPeriodLabel: string;
  forecastPath?: string;
  resolution: H3Resolution;
  ecotype?: string;
};

export function TimeseriesModal({
  open,
  onClose,
  darkMode,
  currentWeek,
  forecastPeriodLabel,
  forecastPath,
  resolution,
  ecotype = "SRKW",
}: Props) {
  const cacheRef = useRef<Map<string, Payload>>(new Map());
  const [payload, setPayload] = useState<Payload | null>(null);
  const [plotError, setPlotError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [forecastWeek, setForecastWeek] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setPayload(null);
    setIsLoading(true);
    setPlotError(null);
    const cacheKey = `${ecotype}-${resolution}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setPayload(cached);
      setIsLoading(false);
      return;
    }

    const load = async () => {
      try {
        const base = import.meta.env.BASE_URL || "/";
        const makeUrl = (path: string) => {
          const clean = path.startsWith("/") ? path : `/${path}`;
          return `${window.location.origin}${clean}`;
        };
        const candidates = [
          makeUrl(`${base}data/activity/activity_by_decade_week_${ecotype}_${resolution}.json`),
        ];

        let data: Payload | null = null;
        for (const url of candidates) {
          const res = await fetch(url, { cache: "force-cache" });
          if (!res.ok) continue;
          const text = await res.text();
          if (text.trim().startsWith("<")) continue;
          data = JSON.parse(text) as Payload;
          break;
        }
        if (!data) {
          throw new Error("Data not available");
        }
        cacheRef.current.set(cacheKey, data);
        setPayload(data);
        setPlotError(null);
      } catch (err) {
         
        console.warn("[Timeseries] failed to load activity data", err);
        setPlotError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [open, ecotype, resolution]);

  useEffect(() => {
    if (!open) return;
    setForecastWeek(null);
    const loadForecastWeek = async () => {
      try {
        const path = forecastPath ?? FORECAST_PATH_LATEST_WEEKLY[resolution];
        const url = new URL(path, window.location.origin).toString();
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) return;
        const text = await res.text();
        if (text.trim().startsWith("<")) return;
        const data = JSON.parse(text) as {
          stat_week?: number;
          statWeek?: number;
          target_start?: string;
        };
        const stat = data.stat_week ?? data.statWeek;
        if (typeof stat === "number" && Number.isFinite(stat)) {
          setForecastWeek(stat);
          return;
        }
        if (data.target_start) {
          setForecastWeek(isoWeekFromDate(new Date(data.target_start)));
        }
      } catch {
        // no-op: fallback to currentWeek
      }
    };
    loadForecastWeek();
  }, [open, resolution, forecastPath]);

  const activeWeek = forecastWeek ?? currentWeek;

  if (!open) return null;

  return (
    <div
      className={`overlay overlay--blur${darkMode ? "" : " overlay--light"}`}
      onClick={onClose}
      role="presentation"
    >
      <section
        className={`modal modal--timeseries${darkMode ? "" : " modal--light"}`}
        onClick={(e) => e.stopPropagation()}
        aria-label="Weekly Sighting Activity - Average # of Active Grids by Week"
      >
        <div className="modal__header">
          <div>
            <div className="modal__title">Weekly Sighting Activity (Average Weekly # Each Decade)</div>
            <div className="modal__subtitle">Avg by decade</div>
          </div>
          <button className="iconBtn iconBtn--ghost" onClick={onClose} aria-label="Close">
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>
          <div className="modal__body">
            <div className="timeseries__chart">
              <div className="timeseries__plot">
                {payload && (
                  <WeeklySightingActivitySvg
                    rows={payload.rows}
                    currentWeek={activeWeek}
                    darkMode={darkMode}
                  />
                )}
              </div>
              {(!payload || plotError || isLoading) && (
                <div className="timeseries__loading">
                  {isLoading && "Loading chart…"}
                  {!isLoading && plotError && plotError}
                  {!isLoading && !plotError && !payload && "Data not available"}
                </div>
              )}
            </div>
          <div className="timeseries__meta">
            <span>Current week: {activeWeek}</span>
            <span>Forecast period: {forecastPeriodLabel}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
