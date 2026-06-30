import { useId } from "react";

// If you already have H3Res defined elsewhere, import it instead.
// e.g. import type { H3Res } from "../types";
export type H3Res = 4 | 5 | 6;

type Props = {
  selected?: H3Res; // ✅ changed from boolean
  size?: number;
  className?: string;
  title?: string;
};

const DEFAULT_SIZE = 24;
const STROKE_DEFAULT = "var(--h3-icon-stroke, rgba(255,255,255,0.92))";
const STROKE_SELECTED = "var(--h3-icon-selected, var(--teal))";

export function StackedHexIcon({
  selected, // ✅ no default "false"
  size = DEFAULT_SIZE,
  className,
  title,
}: Props) {
  const titleId = useId();

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 128 128"
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="geometricPrecision"
      role="img"
      aria-hidden={title ? undefined : true}
      aria-label={title}
      aria-labelledby={title ? titleId : undefined}
      fill="none"
    >
      {title && <title id={titleId}>{title}</title>}

      {[
        { scale: 1.0, strokeWidth: 5, isActive: selected === 4 },
        { scale: 0.68, strokeWidth: 4.5, isActive: selected === 5 },
        { scale: 0.42, strokeWidth: 4, isActive: selected === 6 },
      ].map((layer, index) => (
        <polygon
          key={index}
          points="40,0 20,34.641 -20,34.641 -40,0 -20,-34.641 20,-34.641"
          transform={`translate(64 64) scale(${layer.scale})`}
          stroke={layer.isActive ? STROKE_SELECTED : STROKE_DEFAULT}
          strokeWidth={layer.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
