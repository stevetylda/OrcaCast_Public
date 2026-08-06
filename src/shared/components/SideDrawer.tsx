import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getNavigationRoutes, isRouteActive } from "../config/routes";
import { useDialogFocus } from "./useDialogFocus";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SideDrawer({ open, onClose }: Props) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useDialogFocus({ open, dialogRef, initialFocusRef: closeButtonRef, onClose });

  const items = getNavigationRoutes("drawer");

  if (!open) return null;

  return (
    <div
      className="overlay overlay--editorial"
      onClick={onClose}
      role="presentation"
    >
      <aside
        ref={dialogRef}
        className="sideDrawer sideDrawer--editorial"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        tabIndex={-1}
      >
        <div className="sideDrawer__header">
          <div>
            <p className="sideDrawer__eyebrow">OrcaCast</p>
            <div className="sideDrawer__title">Explore the water</div>
          </div>
          <button
            ref={closeButtonRef}
            className="iconBtn iconBtn--ghost"
            onClick={onClose}
            aria-label="Close menu"
            type="button"
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <nav className="sideDrawer__nav" aria-label="Primary navigation">
          {items.map((item) => {
            const isActive = isRouteActive(pathname, item);

            return (
              <button
                key={item.path}
                className={`sideDrawer__item${isActive ? " sideDrawer__item--active" : ""}`}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  navigate(item.path);
                  onClose();
                }}
              >
                <span
                  className="material-symbols-rounded sideDrawer__itemIcon"
                  aria-hidden="true"
                >
                  {item.drawerIcon}
                </span>
                <span className="sideDrawer__itemLabel">
                  <span className="sideDrawer__itemLabelText">
                    {item.navigationLabel}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
