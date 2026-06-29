// import { useLocation, useNavigate } from "react-router-dom";

// type Props = {
//   open: boolean;
//   onClose: () => void;
// };

// export function SideDrawer({ open, onClose }: Props) {
//   const { pathname } = useLocation();
//   const navigate = useNavigate();
//   const items = [
//     { label: "Map", path: "/" },
//     { label: "About", path: "/about" },
//     { label: "Models", path: "/models" },
//     { label: "Performance", path: "/performance" },
//     { label: "Data", path: "/data" },
//   ];

//   if (!open) return null;

//   return (
//     <div className="overlay" onClick={onClose} role="presentation">
//       <aside
//         className="sideDrawer"
//         onClick={(e) => e.stopPropagation()}
//         aria-label="Main menu"
//       >
//         <div className="sideDrawer__header">
//           <div className="sideDrawer__title">Menu</div>
//           <button className="iconBtn iconBtn--ghost" onClick={onClose} aria-label="Close">
//             <span className="material-symbols-rounded">close</span>
//           </button>
//         </div>

//         <nav className="sideDrawer__nav">
//           {items.map((item) => {
//             const isActive = item.path === "/" ? pathname === "/" : pathname === item.path;
//             return (
//               <button
//                 key={item.path}
//                 className={`sideDrawer__item${isActive ? " sideDrawer__item--active" : ""}`}
//                 type="button"
//                 aria-current={isActive ? "page" : undefined}
//                 onClick={() => {
//                   navigate(item.path);
//                   onClose();
//                 }}
//               >
//                 {item.label}
//               </button>
//             );
//           })}
//         </nav>
//       </aside>
//     </div>
//   );
// }

import { useLocation, useNavigate } from "react-router-dom";

type NavItem = {
  label: string;
  path: string;
  icon: string; // material symbol name
  comingSoon?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SideDrawer({ open, onClose }: Props) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const items: NavItem[] = [
    { label: "Forecast", path: "/", icon: "map_search" },
    { label: "About", path: "/about", icon: "info" },
  ];

  if (!open) return null;

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <aside
        className="sideDrawer"
        onClick={(e) => e.stopPropagation()}
        aria-label="Main menu"
      >
        <div className="sideDrawer__header">
          <div className="sideDrawer__title">Menu</div>
          <button
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
            const isDisabled = Boolean(item.comingSoon);
            const isActive = !isDisabled && (item.path === "/" ? pathname === "/" : pathname === item.path);

            return (
              <button
                key={item.path}
                className={`sideDrawer__item${isActive ? " sideDrawer__item--active" : ""}${
                  isDisabled ? " sideDrawer__item--disabled" : ""
                }`}
                type="button"
                aria-current={isActive ? "page" : undefined}
                aria-disabled={isDisabled}
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) {
                    return;
                  }
                  navigate(item.path);
                  onClose();
                }}
              >
                <span
                  className="material-symbols-rounded sideDrawer__itemIcon"
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <span className="sideDrawer__itemLabel">
                  <span className={isDisabled ? "sideDrawer__itemLabelText sideDrawer__itemLabelText--soon" : "sideDrawer__itemLabelText"}>
                    {item.label}
                  </span>
                  {isDisabled && <span className="sideDrawer__soonTag">Coming soon</span>}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
