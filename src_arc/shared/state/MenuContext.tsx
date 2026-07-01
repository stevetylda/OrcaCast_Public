import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type MenuState = {
  menuOpen: boolean;
  setMenuOpen: (value: boolean) => void;
};

const MenuContext = createContext<MenuState | null>(null);

export function MenuProvider({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const value = useMemo(() => ({ menuOpen, setMenuOpen }), [menuOpen]);
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu must be used within MenuProvider");
  return ctx;
}
