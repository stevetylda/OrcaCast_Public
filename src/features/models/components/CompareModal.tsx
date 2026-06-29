import { useEffect, useId, useMemo, useState } from "react";
import type { ModelInfo } from "../data/dummyModels";
import { CompareDividerPill } from "../../../components/Compare/CompareDividerPill";
import { CompareAdvancedPopover } from "../../../components/Compare/CompareAdvancedPopover";
import { CompareTray } from "../../../components/Compare/CompareTray";
import { SplitCompareView } from "../../../components/Compare/SplitCompareView";
import { DEFAULT_COMPARE_SETTINGS, type CompareSettings } from "../../../state/compareStore";

type Props = {
  open: boolean;
  models: ModelInfo[];
  allModels: ModelInfo[];
  selectedIds: string[];
  onAdd: (id: string) => void;
  onClose: () => void;
  onRemove: (id: string) => void;
};

const PERIOD_OPTIONS = ["Current", "-1 week", "-2 weeks", "-4 weeks"];

export function CompareModal({ open, models, allModels, selectedIds, onAdd, onClose, onRemove }: Props) {
  const titleId = useId();
  const availableModels = useMemo(
    () => allModels.filter((model) => !selectedIds.includes(model.id)),
    [allModels, selectedIds]
  );
  const [showAddList, setShowAddList] = useState(false);
  const [settings, setSettings] = useState<CompareSettings>(DEFAULT_COMPARE_SETTINGS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [modelAId, setModelAId] = useState("");
  const [modelBId, setModelBId] = useState("");
  const [periodA, setPeriodA] = useState(PERIOD_OPTIONS[0]);
  const [periodB, setPeriodB] = useState(PERIOD_OPTIONS[0]);
  const [selectionReadout, setSelectionReadout] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const firstModelId = models[0]?.id ?? allModels[0]?.id ?? "";
  const secondModelId = models[1]?.id ?? allModels[1]?.id ?? firstModelId;
  const effectiveModelAId = modelAId || firstModelId;
  const effectiveModelBId = modelBId || secondModelId;
  const modelA = allModels.find((model) => model.id === effectiveModelAId) ?? models[0] ?? null;
  const modelB = allModels.find((model) => model.id === effectiveModelBId) ?? models[1] ?? models[0] ?? null;

  const swapModels = () => {
    setModelAId(effectiveModelBId);
    setModelBId(effectiveModelAId);
    setPeriodA(periodB);
    setPeriodB(periodA);
  };

  if (!open) return null;

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <section
        className="modal modelsCompareModal modelsCompareModal--workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div className="modal__title" id={titleId}>
            Compare models
          </div>
          <button className="iconBtn iconBtn--ghost" onClick={onClose} aria-label="Close" type="button">
            <span className="material-symbols-rounded" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <div className="modal__body modelsCompareModal__workspaceBody">
          {modelA && modelB ? (
            <div className="compareModeStage">
              <SplitCompareView
                mode={settings.mode}
                splitPct={settings.splitPct}
                fixedSplit={settings.fixedSplit}
                onSplitCommit={(splitPct) => setSettings((prev) => ({ ...prev, splitPct }))}
                onResize={() => {
                  window.dispatchEvent(new Event("resize"));
                }}
                dividerOverlay={
                  <CompareDividerPill
                    mode={settings.mode}
                    onSwap={swapModels}
                    onToggleMode={() =>
                      setSettings((prev) => ({
                        ...prev,
                        mode: prev.mode === "split" ? "overlay" : "split",
                      }))
                    }
                    onOpenAdvanced={() => setShowAdvanced((prev) => !prev)}
                  />
                }
                childrenA={
                  <button
                    type="button"
                    className="compareModelPanel compareModelPanel--left"
                    onClick={() =>
                      setSelectionReadout(
                        `H3: ${modelA.tags[2] ?? "H5"} | A: ${modelA.hero.value} | B: ${modelB.hero.value}${
                          settings.showDelta ? ` | Δ ${(Number(modelA.hero.value) - Number(modelB.hero.value)).toFixed(3)}` : ""
                        }`
                      )
                    }
                  >
                    <span className="compareModelPanel__label">A · {periodA}</span>
                    <h4>{modelA.name}</h4>
                    <p>{modelA.blurb}</p>
                  </button>
                }
                childrenB={
                  <button
                    type="button"
                    className="compareModelPanel compareModelPanel--right"
                    style={{ opacity: settings.mode === "overlay" ? settings.overlayOpacity : 1 }}
                    onClick={() =>
                      setSelectionReadout(
                        `H3: ${modelB.tags[2] ?? "H5"} | A: ${modelA.hero.value} | B: ${modelB.hero.value}${
                          settings.showDelta ? ` | Δ ${(Number(modelA.hero.value) - Number(modelB.hero.value)).toFixed(3)}` : ""
                        }`
                      )
                    }
                  >
                    <span className="compareModelPanel__label">B · {periodB}</span>
                    <h4>{modelB.name}</h4>
                    <p>{modelB.blurb}</p>
                  </button>
                }
              />

              <CompareAdvancedPopover
                open={showAdvanced}
                settings={settings}
                onClose={() => setShowAdvanced(false)}
                onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
              />

              <CompareTray
                modelAId={effectiveModelAId}
                modelBId={effectiveModelBId}
                periodA={periodA}
                periodB={periodB}
                sharedScale={settings.sharedScale}
                periodOptions={PERIOD_OPTIONS}
                models={allModels}
                selectionReadout={selectionReadout}
                onChangeModelA={setModelAId}
                onChangeModelB={setModelBId}
                onChangePeriodA={setPeriodA}
                onChangePeriodB={setPeriodB}
                onToggleSharedScale={(sharedScale) => setSettings((prev) => ({ ...prev, sharedScale }))}
              />
            </div>
          ) : (
            <div className="modelsCompareModal__notice">Select at least two models to compare.</div>
          )}
        </div>

        <aside className={`modelsCompareAddPanel ${showAddList ? "isOpen" : ""}`} aria-hidden={!showAddList}>
          <div className="modelsCompareAddPanel__header">
            <div className="modelsCompareAddPanel__title">Add model</div>
            <button
              type="button"
              className="modelsCompareAddPanel__close"
              onClick={() => setShowAddList(false)}
              aria-label="Close add panel"
            >
              <span className="material-symbols-rounded" aria-hidden="true">
                close
              </span>
            </button>
          </div>
          <div className="modelsCompareAddPanel__list" role="list">
            {availableModels.length === 0 ? (
              <div className="modelsCompareAddPanel__empty">No more models available.</div>
            ) : (
              availableModels.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className="modelsCompareAddPanel__item"
                  onClick={() => {
                    onAdd(model.id);
                    setShowAddList(false);
                  }}
                >
                  {model.name}
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="modelsCompareModal__footerActions">
          <button type="button" className="modelsCompareCard__remove" onClick={() => onRemove(effectiveModelAId)}>
            Remove A
          </button>
          <button type="button" className="modelsCompareCard__remove" onClick={() => onRemove(effectiveModelBId)}>
            Remove B
          </button>
          <button
            type="button"
            className="modelsCompareAddRail"
            onClick={() => setShowAddList((prev) => !prev)}
            aria-label="Add model"
            disabled={availableModels.length === 0}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              add
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
