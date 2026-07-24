import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ForwardedRef,
  type Ref,
} from "react";
import type { PaletteDef, PaletteId } from "../geo/palettes";
import "./ActivityLegend.css";

type ActivityLegendProps = {
  className?: string;
  colors: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaletteSelect: (paletteId: PaletteId) => void;
  palettes: PaletteDef[];
  selectedPaletteId: PaletteId;
  triggerRef?: Ref<HTMLButtonElement>;
  title?: string;
  value?: string;
  icon?: string;
  iconSrc?: string;
};

function assignRef<T>(ref: ForwardedRef<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export const ActivityLegend = forwardRef<HTMLElement, ActivityLegendProps>(
  function ActivityLegend(
    {
      className = "",
      colors,
      open,
      onOpenChange,
      onPaletteSelect,
      palettes,
      selectedPaletteId,
      triggerRef,
      title = "Activity likelihood",
      value,
      icon,
      iconSrc,
    },
    forwardedRef,
  ) {
    const containerRef = useRef<HTMLElement | null>(null);
    const internalTriggerRef = useRef<HTMLButtonElement | null>(null);
    const setContainerRef = useCallback(
      (node: HTMLElement | null) => {
        containerRef.current = node;
        assignRef(forwardedRef, node);
      },
      [forwardedRef],
    );
    const setTriggerRef = useCallback(
      (node: HTMLButtonElement | null) => {
        internalTriggerRef.current = node;
        assignRef(triggerRef, node);
      },
      [triggerRef],
    );

    useEffect(() => {
      if (!open) return;
      const focusFrame = window.requestAnimationFrame(() => {
        containerRef.current
          ?.querySelector<HTMLElement>(
            '[role="option"][aria-selected="true"], [role="option"]',
          )
          ?.focus();
      });
      const onPointerDown = (event: MouseEvent) => {
        if (!containerRef.current?.contains(event.target as Node)) {
          onOpenChange(false);
        }
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        onOpenChange(false);
        internalTriggerRef.current?.focus();
      };
      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        window.cancelAnimationFrame(focusFrame);
        document.removeEventListener("mousedown", onPointerDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [onOpenChange, open]);

    return (
      <aside
        ref={setContainerRef}
        className={`plannerResultsPage__legendCard activityLegend${open ? " isPaletteOpen" : ""}${className ? ` ${className}` : ""}`}
        aria-label="Orca activity likelihood legend, lower to higher"
      >
        <button
          ref={setTriggerRef}
          type="button"
          className="activityLegend__trigger"
          aria-label="Activity likelihood color scale"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        />
        {value ? (
          <div className="activityLegend__summary">
            {iconSrc ? (
              <img
                className="activityLegend__icon activityLegend__iconImage"
                src={iconSrc}
                alt=""
                aria-hidden="true"
              />
            ) : icon ? (
              <span
                className="material-symbols-rounded activityLegend__icon"
                aria-hidden="true"
              >
                {icon}
              </span>
            ) : null}
            <span>
              <strong className="activityLegend__title">{title}</strong>
              <b className="activityLegend__value">{value}</b>
            </span>
          </div>
        ) : (
          <strong className="activityLegend__title">{title}</strong>
        )}
        <div className="activityLegend__scale">
          <span>Lower</span>
          <div className="activityLegend__ramp" aria-hidden="true">
            {colors.map((color, index) => (
              <span
                key={`${color}-${index}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <span>Higher</span>
        </div>
        {open ? (
          <div
            className="activityLegend__paletteList"
            role="listbox"
            aria-label="Color scale palettes"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              const options = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  '[role="option"]',
                ),
              );
              const currentIndex = options.indexOf(
                document.activeElement as HTMLElement,
              );
              let nextIndex = currentIndex;
              if (event.key === "ArrowDown") nextIndex += 1;
              else if (event.key === "ArrowUp") nextIndex -= 1;
              else if (event.key === "Home") nextIndex = 0;
              else if (event.key === "End") nextIndex = options.length - 1;
              else return;
              event.preventDefault();
              options[
                Math.max(0, Math.min(options.length - 1, nextIndex))
              ]?.focus();
            }}
          >
            {palettes.map((palette) => {
              const selected = palette.id === selectedPaletteId;
              return (
                <button
                  key={palette.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  className={`activityLegend__paletteRow${selected ? " isSelected" : ""}`}
                  onClick={() => {
                    onPaletteSelect(palette.id);
                    onOpenChange(false);
                  }}
                >
                  <span
                    className="activityLegend__paletteSwatches"
                    aria-hidden="true"
                  >
                    {palette.colors.slice(0, 6).map((color, index) => (
                      <span
                        key={`${palette.id}-${color}-${index}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  <span>{palette.name}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </aside>
    );
  },
);
