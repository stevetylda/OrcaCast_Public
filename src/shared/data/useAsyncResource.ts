import { useEffect, useState } from "react";

export type AsyncResource<T> =
  { status: "loading" | "error"; data: null } | { status: "ready"; data: T };

/** Load an independent resource with explicit availability and retry behavior. */
export function useAsyncResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<AsyncResource<T>>({
    status: "loading",
    data: null,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void load().then(
      (data) => {
        if (active) setState({ status: "ready", data });
      },
      () => {
        if (active) setState({ status: "error", data: null });
      },
    );
    return () => {
      active = false;
    };
  }, [load, attempt]);
  return {
    ...state,
    retry: () => {
      setState({ status: "loading", data: null });
      setAttempt((value) => value + 1);
    },
  };
}
