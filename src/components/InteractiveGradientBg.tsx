import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

type Props = {
  strength?: number;
  blur?: number;
  opacity?: number;
  className?: string;
};

export function InteractiveGradientBg({
  strength = 0.12,
  blur = 80,
  opacity = 0.9,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      element.style.setProperty("--gx", "50%");
      element.style.setProperty("--gy", "35%");
      element.style.setProperty("--g2x", "18%");
      element.style.setProperty("--g2y", "75%");
      element.style.setProperty("--g3x", "78%");
      element.style.setProperty("--g3y", "22%");
      return;
    }

    const target = { x: 0.5, y: 0.35 };
    const current = { x: 0.5, y: 0.35 };
    let rafId = 0;

    const update = () => {
      current.x += (target.x - current.x) * strength;
      current.y += (target.y - current.y) * strength;

      const gx = clamp(current.x * 100, 0, 100);
      const gy = clamp(current.y * 100, 0, 100);
      const g2x = clamp((1 - current.x) * 100 + 6, 0, 100);
      const g2y = clamp(current.y * 100 + 40, 0, 100);
      const g3x = clamp(current.x * 100 + 18, 0, 100);
      const g3y = clamp((1 - current.y) * 100 - 10, 0, 100);

      element.style.setProperty("--gx", `${gx}%`);
      element.style.setProperty("--gy", `${gy}%`);
      element.style.setProperty("--g2x", `${g2x}%`);
      element.style.setProperty("--g2y", `${g2y}%`);
      element.style.setProperty("--g3x", `${g3x}%`);
      element.style.setProperty("--g3y", `${g3y}%`);

      rafId = window.requestAnimationFrame(update);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      target.x = clamp(x, 0, 1);
      target.y = clamp(y, 0, 1);
    };

    const handlePointerLeave = () => {
      target.x = 0.5;
      target.y = 0.35;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerleave", handlePointerLeave);
    rafId = window.requestAnimationFrame(update);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      window.cancelAnimationFrame(rafId);
    };
  }, [strength]);

  const style = {
    "--ig-blur": `${blur}px`,
    "--ig-opacity": opacity,
  } as CSSProperties;

  return <div ref={containerRef} className={`igBg ${className}`.trim()} style={style} aria-hidden="true" />;
}
