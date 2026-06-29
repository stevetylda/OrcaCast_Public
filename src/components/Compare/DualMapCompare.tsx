import { useEffect } from "react";
import type { ReactNode } from "react";

type Props = {
  childrenLeft: ReactNode;
  childrenRight: ReactNode;
};

export function DualMapCompare({ childrenLeft, childrenRight }: Props) {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
     
    console.info("DualMapCompare: created mapLeft/mapRight");
    const id = window.setTimeout(() => {
      const n = document.querySelectorAll(".maplibregl-canvas").length;
      if (n < 2) {
        throw new Error(`DualMapCompare invariant failed: expected 2 canvases, found ${n}`);
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="dualCompareMaps">
      <div className="dualCompareMaps__pane dualCompareMaps__pane--left">{childrenLeft}</div>
      <div className="dualCompareMaps__pane dualCompareMaps__pane--right">{childrenRight}</div>
      <div className="dualCompareMaps__divider" aria-hidden="true">
        <span className="dualCompareMaps__handle">
          <span className="material-symbols-rounded">lock</span>
        </span>
      </div>
    </div>
  );
}
