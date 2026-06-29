import type React from "react";
import { useMemo, useRef, useState, useEffect } from "react";
import type { ModelInfo } from "../data/dummyModels";
import { ModelCard } from "./ModelCard";
import { CompareTray } from "./CompareTray";
import { CompareModal } from "./CompareModal";

type Props = {
  models: ModelInfo[];
};

type DragState = {
  id: string | null;
  startX: number;
  startY: number;
  dragging: boolean;
};

const MAX_COMPARE = 4;
const DRAG_DISTANCE = 8;

export function ModelCarousel({ models }: Props) {
  const modelsById = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [trayMessage, setTrayMessage] = useState<string | null>(null);

  const trayRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState>({ id: null, startX: 0, startY: 0, dragging: false });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!trayMessage) return;
    const timer = window.setTimeout(() => setTrayMessage(null), 2400);
    return () => window.clearTimeout(timer);
  }, [trayMessage]);

  useEffect(() => {
    if (!draggingId) return;
    document.body.classList.add("modelsDragging");
    return () => {
      document.body.classList.remove("modelsDragging");
    };
  }, [draggingId]);

  const selectedModels = selectedIds
    .map((id) => modelsById.get(id))
    .filter((model): model is ModelInfo => Boolean(model));

  const addModel = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev;
      if (prev.length >= MAX_COMPARE) {
        setTrayMessage(`Compare tray holds up to ${MAX_COMPARE} models.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const toggleCompare = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= MAX_COMPARE) {
        setTrayMessage(`Compare tray holds up to ${MAX_COMPARE} models.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const removeModel = (id: string) => {
    setSelectedIds((prev) => prev.filter((item) => item !== id));
  };

  const clearModels = () => {
    setSelectedIds([]);
  };

  const openCompare = () => {
    if (selectedIds.length < 2) return;
    setModalOpen(true);
  };

  const closeCompare = () => {
    setModalOpen(false);
  };

  const handlePointerDown =
    (id: string) => (event: React.PointerEvent<HTMLElement>) => {
      const target = event.target as Element | null;
      if (target && target.closest("button, a, input, textarea, select, [data-no-drag]")) {
        return;
      }
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState.id) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    const distance = Math.hypot(dx, dy);

    if (!dragState.dragging && distance > DRAG_DISTANCE) {
      dragState.dragging = true;
      setDraggingId(dragState.id);
    }

    if (dragState.dragging) {
      setDragPosition({ x: event.clientX, y: event.clientY });
      if (trayRef.current) {
        const rect = trayRef.current.getBoundingClientRect();
        const over =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        setIsDragOver(over);
      }
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState.id) return;

    if (dragState.dragging && trayRef.current) {
      event.preventDefault();
      event.stopPropagation();
      const rect = trayRef.current.getBoundingClientRect();
      const over =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (over) {
        addModel(dragState.id);
      }
    }

    dragStateRef.current = { id: null, startX: 0, startY: 0, dragging: false };
    setDraggingId(null);
    setDragPosition(null);
    setIsDragOver(false);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    dragStateRef.current = { id: null, startX: 0, startY: 0, dragging: false };
    setDraggingId(null);
    setDragPosition(null);
    setIsDragOver(false);
  };

  return (
    <div className="modelsCarouselShell">
      <div className="modelsCarousel" role="list">
        {models.map((model) => (
          <div className="modelsCarousel__item" role="listitem" key={model.id}>
            <ModelCard
              model={model}
              selected={selectedIds.includes(model.id)}
              onToggleCompare={toggleCompare}
              isDragging={draggingId === model.id}
              dragProps={{
                onPointerDown: handlePointerDown(model.id),
                onPointerMove: handlePointerMove,
                onPointerUp: handlePointerUp,
                onPointerCancel: handlePointerCancel,
              }}
            />
          </div>
        ))}
        <div className="modelsCarousel__spacer" aria-hidden="true" />
      </div>

      {draggingId && dragPosition ? (
        <div
          className="modelsDragGhost"
          style={{
            transform: `translate(${dragPosition.x + 12}px, ${dragPosition.y + 12}px)`,
          }}
        >
          {modelsById.get(draggingId)?.name}
        </div>
      ) : null}

      <div ref={trayRef} className="modelsTrayWrap">
        <CompareTray
          selectedIds={selectedIds}
          modelsById={modelsById}
          onRemove={removeModel}
          onClear={clearModels}
          onOpenCompare={openCompare}
          isDragActive={Boolean(draggingId)}
          isDragOver={isDragOver}
          message={trayMessage}
        />
      </div>

      <CompareModal
        open={modalOpen}
        models={selectedModels}
        allModels={models}
        selectedIds={selectedIds}
        onAdd={addModel}
        onClose={closeCompare}
        onRemove={removeModel}
      />
    </div>
  );
}
