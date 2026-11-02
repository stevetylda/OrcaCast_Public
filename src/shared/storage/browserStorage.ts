/** Best-effort persistence: browser policy and quota must not break app state. */
export function browserStorage(kind: "localStorage" | "sessionStorage") {
  return {
    getItem(key: string): string | null {
      try {
        return typeof window === "undefined" ? null : window[kind].getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      try {
        if (typeof window !== "undefined") window[kind].setItem(key, value);
      } catch {
        // The current session can continue with React's in-memory state.
      }
    },
    removeItem(key: string): void {
      try {
        if (typeof window !== "undefined") window[kind].removeItem(key);
      } catch {
        // Persistence is optional when storage is blocked or unavailable.
      }
    },
  };
}

export const localPreferences = browserStorage("localStorage");
export const sessionPreferences = browserStorage("sessionStorage");
