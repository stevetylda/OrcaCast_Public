import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { PlannerBaseLocation } from "../../../shared/data/plannerBaseLocations";

type PlannerDateRangeFieldProps = {
  arrivalDate: string;
  departureDate: string;
  labelledBy: string;
  valueId: string;
  onChange: (nextArrivalDate: string, nextDepartureDate: string) => void;
};

type PlannerLocationFieldProps = {
  value: string;
  options: PlannerBaseLocation[];
  labelledBy: string;
  valueId: string;
  onChange: (nextValue: string) => void;
};

function parseIsoDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatPlannerDateFieldValue(startDate: string, endDate: string) {
  if (!startDate && !endDate) return "Select dates";
  if (!startDate) return "Select start date";
  const start = parseIsoDate(startDate);
  if (!start) return "Select dates";
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  if (!endDate) return `${formatter.format(start)} – End date`;
  const end = parseIsoDate(endDate);
  if (!end) return `${formatter.format(start)} – End date`;
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function formatFullDate(dateIso: string) {
  const date = parseIsoDate(dateIso);
  return date
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date)
    : dateIso;
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, months: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
}

function startOfUtcCalendarWeek(date: Date) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - next.getUTCDay());
  return next;
}

function compareIsoDates(dateA: string, dateB: string) {
  if (dateA === dateB) return 0;
  return dateA < dateB ? -1 : 1;
}

function buildCalendarCells(month: Date) {
  const firstDay = startOfUtcMonth(month);
  const gridStart = startOfUtcCalendarWeek(firstDay);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addUtcDays(gridStart, index);
    return {
      iso: formatIsoDate(date),
      label: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month.getUTCMonth(),
    };
  });
}

function dayIsWithinSelectedRange(
  dayIso: string,
  startDate: string,
  endDate: string,
) {
  if (!startDate || !endDate) return false;
  return (
    compareIsoDates(dayIso, startDate) >= 0 &&
    compareIsoDates(dayIso, endDate) <= 0
  );
}

function formatPlannerDateRangeSummary(startDate: string, endDate: string) {
  if (!startDate || !endDate) return "Select an arrival and departure date";
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) return "Select an arrival and departure date";
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const dayCount = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1,
  );
  return `${formatter.format(start)} → ${formatter.format(end)} · ${dayCount} ${dayCount === 1 ? "day" : "days"}`;
}

export function PlannerLocationField({
  value,
  options,
  labelledBy,
  valueId,
  onChange,
}: PlannerLocationFieldProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = `${valueId}-options`;

  const openAt = (index: number) => {
    const boundedIndex = Math.max(0, Math.min(options.length - 1, index));
    setActiveIndex(boundedIndex);
    setOpen(true);
    window.requestAnimationFrame(() =>
      optionRefs.current[boundedIndex]?.focus(),
    );
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let nextIndex = activeIndex;
    if (event.key === "ArrowDown")
      nextIndex = Math.min(options.length - 1, activeIndex + 1);
    else if (event.key === "ArrowUp") nextIndex = Math.max(0, activeIndex - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = options.length - 1;
    else return;
    event.preventDefault();
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      className={`plannerResultsPage__locationField${open ? " isOpen" : ""}`}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className="plannerResultsPage__promptInputWrap plannerResultsPage__promptInputWrap--select"
        onClick={() => {
          if (open) setOpen(false);
          else
            openAt(
              Math.max(
                0,
                options.findIndex((option) => option.name === value),
              ),
            );
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openAt(
              Math.max(
                0,
                options.findIndex((option) => option.name === value),
              ),
            );
          }
        }}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-labelledby={`${labelledBy} ${valueId}`}
      >
        <span className="material-symbols-rounded" aria-hidden="true">
          location_on
        </span>
        <span
          id={valueId}
          className={`plannerResultsPage__locationValue${value ? " hasValue" : ""}`}
        >
          {value || "Select a location"}
        </span>
        <span
          className="material-symbols-rounded plannerResultsPage__locationChevron"
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      {open ? (
        <div
          id={listboxId}
          className="plannerResultsPage__locationPopover"
          role="listbox"
          aria-label="Base location options"
          onKeyDown={handleListKeyDown}
        >
          {options.map((location, index) => {
            const selected = location.name === value;
            return (
              <button
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                key={location.name}
                type="button"
                role="option"
                tabIndex={index === activeIndex ? 0 : -1}
                aria-selected={selected}
                className={`plannerResultsPage__locationOption${selected ? " isSelected" : ""}`}
                onFocus={() => setActiveIndex(index)}
                onClick={() => {
                  onChange(location.name);
                  setOpen(false);
                  window.requestAnimationFrame(() =>
                    triggerRef.current?.focus(),
                  );
                }}
              >
                <span>{location.name}</span>
                {selected ? (
                  <span className="material-symbols-rounded" aria-hidden="true">
                    check
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function PlannerDateRangeField({
  arrivalDate,
  departureDate,
  labelledBy,
  valueId,
  onChange,
}: PlannerDateRangeFieldProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [hoveredDate, setHoveredDate] = useState("");
  const baseVisibleMonth = useMemo(
    () => startOfUtcMonth(parseIsoDate(arrivalDate) ?? new Date()),
    [arrivalDate],
  );
  const [visibleMonthOffset, setVisibleMonthOffset] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (
        !popoverRef.current?.contains(event.target) &&
        !calendarRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => {
      const target = calendarRef.current?.querySelector<HTMLButtonElement>(
        arrivalDate ? `[data-date="${arrivalDate}"]` : "[data-date]",
      );
      target?.focus();
    });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [arrivalDate, open]);

  const visibleMonth = useMemo(
    () => addUtcMonths(baseVisibleMonth, visibleMonthOffset),
    [baseVisibleMonth, visibleMonthOffset],
  );
  const months = useMemo(
    () => [visibleMonth, addUtcMonths(visibleMonth, 1)],
    [visibleMonth],
  );
  const previewRangeEnd = arrivalDate && !departureDate ? hoveredDate : "";

  const handleDaySelect = (dayIso: string) => {
    if (!arrivalDate || departureDate) return onChange(dayIso, "");
    if (compareIsoDates(dayIso, arrivalDate) < 0) {
      onChange(dayIso, arrivalDate);
      setOpen(false);
      return;
    }
    onChange(arrivalDate, dayIso);
  };

  const focusRelativeDay = (dayIso: string, offset: number) => {
    const date = parseIsoDate(dayIso);
    if (!date) return;
    const nextIso = formatIsoDate(addUtcDays(date, offset));
    calendarRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${nextIso}"]`)
      ?.focus();
  };

  return (
    <div
      className={`plannerResultsPage__dateRangeField${open ? " isOpen" : ""}`}
      ref={popoverRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className="plannerResultsPage__promptInputWrap plannerResultsPage__promptInputWrap--range"
        onClick={() =>
          setOpen((value) => {
            const next = !value;
            if (next) setVisibleMonthOffset(0);
            return next;
          })
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${labelledBy} ${valueId}`}
      >
        <span className="material-symbols-rounded" aria-hidden="true">
          calendar_month
        </span>
        <span
          id={valueId}
          className={`plannerResultsPage__dateRangeValue${arrivalDate ? " hasValue" : ""}`}
        >
          {formatPlannerDateFieldValue(arrivalDate, departureDate)}
        </span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="plannerResultsPage__dateRangeBackdrop"
                aria-hidden="true"
                onMouseDown={() => setOpen(false)}
              />
              <div
                ref={calendarRef}
                className="plannerResultsPage__dateRangePopover"
                role="dialog"
                aria-modal="true"
                aria-label="Choose trip dates"
              >
                <div className="plannerResultsPage__dateRangePopoverHead">
                  <div className="plannerResultsPage__dateRangeHeadline">
                    <strong>Select date range</strong>
                    <span>
                      {formatPlannerDateFieldValue(arrivalDate, departureDate)}
                    </span>
                  </div>
                  <div className="plannerResultsPage__dateRangeNav">
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleMonthOffset((current) => current - 1)
                      }
                      aria-label="Previous month"
                    >
                      <span
                        className="material-symbols-rounded"
                        aria-hidden="true"
                      >
                        chevron_left
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleMonthOffset((current) => current + 1)
                      }
                      aria-label="Next month"
                    >
                      <span
                        className="material-symbols-rounded"
                        aria-hidden="true"
                      >
                        chevron_right
                      </span>
                    </button>
                  </div>
                </div>

                <div className="plannerResultsPage__dateRangeCalendars">
                  {months.map((month) => {
                    const monthLabel = new Intl.DateTimeFormat("en-US", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(month);
                    return (
                      <section
                        key={month.toISOString()}
                        className="plannerResultsPage__dateRangeCalendar"
                      >
                        <header>{monthLabel}</header>
                        <div className="plannerResultsPage__dateRangeWeekdays">
                          {["S", "M", "T", "W", "T", "F", "S"].map(
                            (day, index) => (
                              <span key={`${monthLabel}-${day}-${index}`}>
                                {day}
                              </span>
                            ),
                          )}
                        </div>
                        <div className="plannerResultsPage__dateRangeDays">
                          {buildCalendarCells(month).map((cell) => {
                            const isStart = cell.iso === arrivalDate;
                            const isEnd = cell.iso === departureDate;
                            const isPreviewEnd =
                              !departureDate && previewRangeEnd === cell.iso;
                            const isInRange =
                              dayIsWithinSelectedRange(
                                cell.iso,
                                arrivalDate,
                                departureDate,
                              ) ||
                              (!departureDate && arrivalDate && previewRangeEnd
                                ? dayIsWithinSelectedRange(
                                    cell.iso,
                                    compareIsoDates(
                                      arrivalDate,
                                      previewRangeEnd,
                                    ) <= 0
                                      ? arrivalDate
                                      : previewRangeEnd,
                                    compareIsoDates(
                                      arrivalDate,
                                      previewRangeEnd,
                                    ) <= 0
                                      ? previewRangeEnd
                                      : arrivalDate,
                                  )
                                : false);
                            return (
                              <button
                                key={cell.iso}
                                type="button"
                                data-date={cell.iso}
                                aria-label={formatFullDate(cell.iso)}
                                aria-pressed={isStart || isEnd}
                                className={`plannerResultsPage__dateRangeDay${cell.inMonth ? "" : " isOutsideMonth"}${isInRange ? " isInRange" : ""}${isStart ? " isRangeStart" : ""}${isEnd ? " isRangeEnd" : ""}${isPreviewEnd ? " isPreviewEnd" : ""}`}
                                onClick={() => handleDaySelect(cell.iso)}
                                onMouseEnter={() => setHoveredDate(cell.iso)}
                                onKeyDown={(event) => {
                                  const offsets: Record<string, number> = {
                                    ArrowLeft: -1,
                                    ArrowRight: 1,
                                    ArrowUp: -7,
                                    ArrowDown: 7,
                                  };
                                  const offset = offsets[event.key];
                                  if (offset !== undefined) {
                                    event.preventDefault();
                                    focusRelativeDay(cell.iso, offset);
                                  }
                                }}
                              >
                                <span>{cell.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>

                <div className="plannerResultsPage__dateRangeFooter">
                  <span className="plannerResultsPage__dateRangeFooterSummary">
                    {formatPlannerDateRangeSummary(arrivalDate, departureDate)}
                  </span>
                  <div className="plannerResultsPage__dateRangeFooterActions">
                    <button
                      type="button"
                      className="plannerResultsPage__dateRangeFooterButton isSecondary"
                      onClick={() => {
                        onChange("", "");
                        setHoveredDate("");
                      }}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="plannerResultsPage__dateRangeFooterButton isPrimary"
                      onClick={() => {
                        setOpen(false);
                        setHoveredDate("");
                        window.requestAnimationFrame(() =>
                          triggerRef.current?.focus(),
                        );
                      }}
                      disabled={!arrivalDate || !departureDate}
                    >
                      Apply dates
                    </button>
                  </div>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
