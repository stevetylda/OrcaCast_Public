import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type Props = {
  mode: "split" | "overlay";
  splitPct: number;
  fixedSplit: boolean;
  onSplitCommit: (pct: number) => void;
  onResize: () => void;
  childrenA: ReactNode;
  childrenB: ReactNode;
  dividerOverlay?: ReactNode;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function SplitCompareView({
  mode,
  splitPct,
  fixedSplit,
  onSplitCommit,
  onResize,
  childrenA,
  childrenB,
  dividerOverlay,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dragPctRef = useRef(splitPct);

  useEffect(() => {
    dragPctRef.current = splitPct;
    if (rootRef.current) {
      rootRef.current.style.setProperty("--split-pct", `${splitPct}%`);
    }
  }, [splitPct]);

  const scheduleResize = () => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      onResize();
    });
  };

  useEffect(() => {
    scheduleResize();
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const onDividerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (fixedSplit || mode !== "split") return;
    const root = rootRef.current;
    if (!root) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const nextPct = clamp(((moveEvent.clientX - rect.left) / rect.width) * 100, 8, 92);
      dragPctRef.current = nextPct;
      root.style.setProperty("--split-pct", `${nextPct}%`);
      scheduleResize();
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onSplitCommit(dragPctRef.current);
      scheduleResize();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  return (
    <div className={`splitCompareView splitCompareView--${mode}`} ref={rootRef}>
      <div className="splitCompareView__panel splitCompareView__panel--a">{childrenA}</div>
      <div className="splitCompareView__panel splitCompareView__panel--b">{childrenB}</div>
      {mode === "split" ? (
        <div
          className={`splitCompareView__divider ${fixedSplit ? "isFixed" : ""}`}
          onPointerDown={onDividerPointerDown}
          role="separator"
          aria-orientation="vertical"
        >
          {dividerOverlay}
        </div>
      ) : (
        <div className="splitCompareView__overlayCenter">{dividerOverlay}</div>
      )}
    </div>
  );
}
