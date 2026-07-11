import { useEffect, useState } from "react";

type ReturnToTopButtonProps = {
  className?: string;
  label?: string;
};

export function ReturnToTopButton({ className = "", label = "Return to top" }: ReturnToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      setVisible(window.scrollY > Math.min(720, window.innerHeight * 0.72));
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);
    return () => {
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, []);

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      className={`returnToTop${visible ? " isVisible" : ""}${className ? ` ${className}` : ""}`}
      onClick={scrollToTop}
      aria-label={label}
      title={label}
    >
      <span className="material-symbols-rounded" aria-hidden="true">
        arrow_upward
      </span>
      <span>Top</span>
    </button>
  );
}
