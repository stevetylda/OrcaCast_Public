import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function HashScrollHandler() {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (!hash) return;

    let frameId: number | null = null;
    let observer: MutationObserver | null = null;
    const targetId = decodeURIComponent(hash.slice(1));

    const scrollToTarget = () => {
      const target = document.getElementById(targetId);
      if (!target) return false;

      frameId = window.requestAnimationFrame(() => {
        frameId = window.requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: "auto", block: "start" });
        });
      });
      return true;
    };

    if (!scrollToTarget()) {
      observer = new MutationObserver(() => {
        if (!scrollToTarget()) return;
        observer?.disconnect();
        observer = null;
      });
      observer.observe(document.getElementById("root") ?? document.body, {
        childList: true,
        subtree: true,
      });
    }

    const timeoutId = window.setTimeout(() => {
      observer?.disconnect();
      observer = null;
    }, 5_000);

    return () => {
      window.clearTimeout(timeoutId);
      observer?.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [hash, pathname]);

  return null;
}
