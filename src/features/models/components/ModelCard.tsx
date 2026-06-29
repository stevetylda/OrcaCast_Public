import type React from "react";
import { useState } from "react";
import type { ModelInfo } from "../data/dummyModels";

export type ModelCardProps = {
  model: ModelInfo;
  selected: boolean;
  onToggleCompare: (id: string) => void;
  dragProps?: React.HTMLAttributes<HTMLElement>;
  isDragging?: boolean;
};

const FAMILY_LABELS: Record<ModelInfo["family"], string> = {
  baseline: "Baseline",
  composite: "Composite",
  hybrid: "Hybrid",
};

export function ModelCard({ model, selected, onToggleCompare, dragProps, isDragging }: ModelCardProps) {
  const [flipped, setFlipped] = useState(false);
  const handleCompareClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleCompare(model.id);
  };

  const handleComparePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };
  const sparkleClass =
    model.id === "composite-linear-logit"
      ? "modelCardNeo--sparkleGold"
      : model.id === "st-neighbor-climatology"
        ? "modelCardNeo--sparkleSilver"
        : model.id === "rolling-mean-w13"
          ? "modelCardNeo--sparkleBronze"
          : "";

  const familyClass = `modelCardNeo--family-${model.family}`;
  const cardClassName = `modelCardNeo ${familyClass} ${sparkleClass} ${selected ? "isSelected" : ""} ${
    flipped ? "isFlipped" : ""
  } ${isDragging ? "isDragging" : ""}`.trim();

  return (
    <article
      className={cardClassName}
      role="button"
      tabIndex={0}
      onClick={() => setFlipped((prev) => !prev)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setFlipped((prev) => !prev);
        }
      }}
      {...dragProps}
    >
      {model.ribbon ? <span className="modelCardNeo__ribbon">{model.ribbon}</span> : null}
      <div className="modelCardNeo__inner modelCardNeo__face modelCardNeo__face--front">
        <header className="modelCardNeo__header">
          <div>
            <div className="modelCardNeo__name">{model.name}</div>
            <div className="modelCardNeo__family">{FAMILY_LABELS[model.family]}</div>
          </div>
          <div className="modelCardNeo__tags">
            {model.tags.map((tag) => (
              <span className="modelCardNeo__tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </header>

        <div className="modelCardNeo__hero">
          <div className="modelCardNeo__heroLabel">{model.hero.label}</div>
          <div className="modelCardNeo__heroValue">{model.hero.value}</div>
          {model.hero.hint ? <div className="modelCardNeo__heroHint">{model.hero.hint}</div> : null}
        </div>

        <div className="modelCardNeo__rows">
          {model.rows.slice(0, 4).map((row) => (
            <div className="modelCardNeo__row" key={row.key}>
              <span>{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>

        <footer className="modelCardNeo__footer">
          <button
            type="button"
            className={`modelCardNeo__compareBtn ${selected ? "isSelected" : ""}`}
            onClick={handleCompareClick}
            onPointerDown={handleComparePointerDown}
            data-no-drag
          >
            {selected ? "Remove" : "+ Compare"}
          </button>
          <span className="modelCardNeo__dragHandle" aria-hidden="true">
            ⠿
          </span>
        </footer>
      </div>
      <div className="modelCardNeo__inner modelCardNeo__face modelCardNeo__face--back">
        <div className="modelCardNeo__backHeader">
          <div className="modelCardNeo__name">{model.name}</div>
          <div className="modelCardNeo__family">{FAMILY_LABELS[model.family]}</div>
        </div>
        <p className="modelCardNeo__blurb">{model.blurb}</p>
        <div className="modelCardNeo__backMeta">
          <span>{model.tags.join(" · ")}</span>
          <span>Train window: {model.rows.find((row) => row.key === "train_window")?.value ?? "–"}</span>
        </div>
        <div className="modelCardNeo__backHint">Click to flip back</div>
      </div>
    </article>
  );
}
