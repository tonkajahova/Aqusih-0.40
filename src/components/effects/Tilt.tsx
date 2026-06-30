import { useRef, type ReactNode } from "react";

/**
 * Subtle cursor-follow tilt. Desktop only — touch devices skip via
 * `(hover: hover) and (pointer: fine)` check on first mouse enter.
 * Keep `max` small (4-6deg) to feel premium, not gimmicky.
 */
export function Tilt({
  children,
  max = 5,
  scale = 1.015,
  className,
}: {
  children: ReactNode;
  max?: number;
  scale?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const raf = useRef<number | null>(null);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (typeof window !== "undefined" && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transform = `perspective(800px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) scale(${scale})`;
    });
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    el.style.transform = "perspective(800px) rotateX(0) rotateY(0) scale(1)";
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
      style={{ transition: "transform 220ms cubic-bezier(0.2,0.7,0.2,1)", willChange: "transform" }}
    >
      {children}
    </div>
  );
}
