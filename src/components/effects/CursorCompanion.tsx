import { useEffect, useRef } from "react";

/**
 * A small black dot that lags behind the cursor. Desktop only.
 * Hides on touch / coarse pointers. Uses rAF for smoothing.
 */
export function CursorCompanion() {
  const dotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!fine) return;

    const dot = dotRef.current;
    if (!dot) return;
    dot.style.opacity = "1";

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let x = tx;
    let y = ty;
    let raf = 0;

    const move = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };
    const overInteractive = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const interactive = !!t?.closest("a, button, input, textarea, select, [role=button]");
      dot.style.transform = `translate3d(${x - 4}px, ${y - 4}px, 0) scale(${interactive ? 2.2 : 1})`;
      dot.style.opacity = interactive ? "0.45" : "0.85";
    };

    const tick = () => {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      dot.style.transform = `translate3d(${x - 4}px, ${y - 4}px, 0) ${dot.style.transform.includes("scale(2") ? "scale(2.2)" : "scale(1)"}`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", move, { passive: true });
    window.addEventListener("mousemove", overInteractive, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mousemove", overInteractive);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={dotRef}
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 8,
        height: 8,
        borderRadius: 9999,
        background: "#000",
        pointerEvents: "none",
        zIndex: 9999,
        opacity: 0,
        transition: "opacity 200ms ease, background 200ms ease",
        mixBlendMode: "difference",
      }}
    />
  );
}
