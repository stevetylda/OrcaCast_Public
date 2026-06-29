import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type OrcaDropdownItem = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type Props = {
  label?: string;
  valueLabel: string;
  items: OrcaDropdownItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  iconOnly?: boolean;
  showChevron?: boolean;
  sideOffset?: number;
  minMenuWidth?: number;
  matchTriggerWidth?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
};

const PORTAL_ROOT_ID = "portal-root";

function ensurePortalRoot(): HTMLElement {
  const existing = document.getElementById(PORTAL_ROOT_ID);
  if (existing) return existing;
  const root = document.createElement("div");
  root.id = PORTAL_ROOT_ID;
  document.body.appendChild(root);
  return root;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function OrcaDropdown({
  label,
  valueLabel,
  items,
  selectedId,
  onSelect,
  ariaLabel,
  iconLeft,
  iconRight,
  iconOnly = false,
  showChevron = true,
  sideOffset = 8,
  minMenuWidth = 0,
  matchTriggerWidth = true,
  className = "",
  triggerClassName = "",
  menuClassName = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const portalRoot = useMemo(
    () => (typeof document === "undefined" ? null : ensurePortalRoot()),
    []
  );

  const enabledIndices = useMemo(
    () => items.map((item, index) => ({ item, index })).filter((entry) => !entry.item.disabled),
    [items]
  );
  const isLightTheme =
    typeof document !== "undefined" && !document.querySelector(".app")?.classList.contains("app--dark");

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const triggerRect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const menuRect = menu.getBoundingClientRect();
    const targetWidth = matchTriggerWidth
      ? Math.max(triggerRect.width, minMenuWidth)
      : Math.max(minMenuWidth, menuRect.width, triggerRect.width);
    const maxLeft = window.innerWidth - viewportPadding - targetWidth;
    const left = clamp(triggerRect.left, viewportPadding, Math.max(viewportPadding, maxLeft));
    const top = triggerRect.bottom + sideOffset;
    const maxHeight = Math.max(160, window.innerHeight - top - viewportPadding);

    setMenuStyle({
      position: "fixed",
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(targetWidth)}px`,
      maxHeight: `${Math.round(maxHeight)}px`,
      zIndex: 2000,
    });
  }, [matchTriggerWidth, minMenuWidth, sideOffset]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();

    let rafId = 0;
    const tick = () => {
      updatePosition();
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    const handleWindowChange = () => updatePosition();
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [open, updatePosition]);

  const openMenu = () => {
    const selectedEnabledIndex = enabledIndices.find((entry) => entry.item.id === selectedId)?.index ?? -1;
    const fallbackIndex = enabledIndices[0]?.index ?? -1;
    setActiveIndex(selectedEnabledIndex >= 0 ? selectedEnabledIndex : fallbackIndex);
    setOpen(true);
    window.requestAnimationFrame(() => menuRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const moveActive = (delta: number) => {
    if (enabledIndices.length === 0) return;
    const currentEnabledPosition = enabledIndices.findIndex((entry) => entry.index === activeIndex);
    const start = currentEnabledPosition >= 0 ? currentEnabledPosition : 0;
    const next = (start + delta + enabledIndices.length) % enabledIndices.length;
    setActiveIndex(enabledIndices[next].index);
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      if (enabledIndices.length > 0) setActiveIndex(enabledIndices[0].index);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      if (enabledIndices.length > 0) setActiveIndex(enabledIndices[enabledIndices.length - 1].index);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const activeItem = items[activeIndex];
      if (!activeItem || activeItem.disabled) return;
      onSelect(activeItem.id);
      closeAndFocusTrigger();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndFocusTrigger();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className={`orcaDropdown ${open ? "isOpen" : ""} ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className={`orcaDropdown__trigger ${triggerClassName}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        title={ariaLabel}
      >
        {iconLeft ? <span className="orcaDropdown__iconLeft">{iconLeft}</span> : null}
        {!iconOnly && label ? <span className="orcaDropdown__label">{label}</span> : null}
        {!iconOnly ? <span className="orcaDropdown__value">{valueLabel}</span> : null}
        {iconRight ? <span className="orcaDropdown__iconRight">{iconRight}</span> : null}
        {showChevron ? (
          <span className="orcaDropdown__chevron" aria-hidden="true">
            ▾
          </span>
        ) : null}
      </button>
      {open && portalRoot
        ? createPortal(
            <div
              ref={menuRef}
              className={`orcaDropdown__menu ${isLightTheme ? "orcaDropdown__menu--light" : ""} ${menuClassName}`.trim()}
              role="listbox"
              aria-label={ariaLabel}
              tabIndex={-1}
              style={menuStyle}
              onKeyDown={onMenuKeyDown}
            >
              {items.map((item, index) => {
                const isActive = index === activeIndex;
                const isSelected = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    className={`orcaDropdown__item${isLightTheme ? " orcaDropdown__item--light" : ""}${isSelected ? " isSelected" : ""}${isActive ? " isActive" : ""}`}
                    aria-selected={isSelected}
                    disabled={item.disabled}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      if (item.disabled) return;
                      onSelect(item.id);
                      closeAndFocusTrigger();
                    }}
                  >
                    <span className="orcaDropdown__itemLabel">{item.label}</span>
                    {item.description ? (
                      <span className="orcaDropdown__itemDescription">{item.description}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            portalRoot
          )
        : null}
    </div>
  );
}
