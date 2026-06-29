import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { attribution, basemapSources } from "../config/attribution";

type Props = {
  className?: string;
  sources?: string[];
};

export function AttributionHover({ className, sources }: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const resolvedSources = sources ?? attribution.sources;
  const extraCount = useMemo(
    () => Math.max(0, resolvedSources.length - basemapSources.length),
    [resolvedSources]
  );

  const inlineText =
    extraCount > 0 ? `Sources +${extraCount}` : "Sources";

  useEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const portalWidth = 320;
    const minLeft = 8;
    const maxLeft = Math.max(minLeft, window.innerWidth - portalWidth - 8);
    const left = Math.min(Math.max(minLeft, rect.left), maxLeft);
    setPortalStyle({
      position: "fixed",
      left,
      bottom: window.innerHeight - rect.top + 10,
      zIndex: 1000,
    });
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className={className ? `attribHover ${className}` : "attribHover"}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
      tabIndex={0}
      role="button"
      aria-label="Attribution sources"
    >
      <span className="attribHover__text">{inlineText}</span>
      {open &&
        createPortal(
          <div
            className="attribHover__portal"
            role="dialog"
            aria-label="Sources"
            style={portalStyle}
          >
            <div className="attribHover__title">Sources</div>
            <ul className="attribHover__list">
              {resolvedSources.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
