import { useEffect, useState, type CSSProperties } from "react";

type ReturnToTopButtonProps = {
  className?: string;
  label?: string;
};

export function ReturnToTopButton({
  className = "",
  label = "Return to top",
}: ReturnToTopButtonProps) {
  const [visible, setVisible] = useState(false);
  const [footerOffset, setFooterOffset] = useState(0);

  useEffect(() => {
    let animationFrame = 0;
    const footer = document.querySelector<HTMLElement>(".appSiteFooter");

    const updatePosition = () => {
      setVisible(window.scrollY > Math.min(720, window.innerHeight * 0.72));
      setFooterOffset(
        footer
          ? Math.max(0, window.innerHeight - footer.getBoundingClientRect().top)
          : 0,
      );
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    const resizeObserver = footer ? new ResizeObserver(scheduleUpdate) : null;
    if (footer && resizeObserver) resizeObserver.observe(footer);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      resizeObserver?.disconnect();
    };
  }, []);

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      className={`returnToTop${visible ? " isVisible" : ""}${className ? ` ${className}` : ""}`}
      onClick={scrollToTop}
      aria-label={label}
      title={label}
      style={
        {
          "--return-to-top-footer-offset": `${footerOffset}px`,
        } as CSSProperties
      }
    >
      <span className="material-symbols-rounded" aria-hidden="true">
        arrow_upward
      </span>
      <span>Top</span>
    </button>
  );
}
