import { FerryLoadingScene } from "./FerryLoadingScene";
import { OrcaLoadingScene } from "./OrcaLoadingScene";
import "./loading-animation.css";

export type LoadingAnimationVariant = "ferry" | "orca";
export type LoadingAnimationAppearance = "card" | "ambient";

export type LoadingAnimationProps = {
  variant: LoadingAnimationVariant;
  label?: string;
  completeLabel?: string;
  complete?: boolean;
  appearance?: LoadingAnimationAppearance;
  showProgress?: boolean;
  className?: string;
};

const DEFAULT_LABELS: Record<
  LoadingAnimationVariant,
  { loading: string; complete: string }
> = {
  ferry: { loading: "Preparing your trip", complete: "Your trip is ready" },
  orca: {
    loading: "Preparing this week's forecast",
    complete: "This week's forecast is ready",
  },
};

export function LoadingAnimation({
  variant,
  label = DEFAULT_LABELS[variant].loading,
  completeLabel = DEFAULT_LABELS[variant].complete,
  complete = false,
  appearance = "card",
  showProgress = true,
  className,
}: LoadingAnimationProps) {
  const announcedLabel = complete ? completeLabel : label;
  const classes = [
    "loadingAnimation",
    `${variant}-loading-animate`,
    `loadingAnimation--${appearance}`,
    complete ? "isComplete" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      role="status"
      aria-live="polite"
      aria-label={announcedLabel}
    >
      <div className="loadingAnimation__eyebrow">{announcedLabel}</div>
      <div className="loadingAnimation__viewport">
        {variant === "ferry" ? <FerryLoadingScene /> : <OrcaLoadingScene />}
      </div>
      {showProgress ? (
        <div
          className="loadingAnimation__progress"
          aria-hidden="true"
          data-complete={complete ? "true" : "false"}
        >
          <span className="loadingAnimation__progressFill" />
          <span className="loadingAnimation__progressGlint" />
        </div>
      ) : null}
    </div>
  );
}
