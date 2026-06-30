import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Black sheet wipes across the screen on route change. Brief (~360ms),
 * pointer-events disabled. Triggered by pathname changes.
 */
export function PageWipe() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [playKey, setPlayKey] = useState(0);
  const [first, setFirst] = useState(true);

  useEffect(() => {
    if (first) {
      setFirst(false);
      return;
    }
    setPlayKey((k) => k + 1);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (first) return null;

  return (
    <div
      key={playKey}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        zIndex: 9998,
        pointerEvents: "none",
        transformOrigin: "left center",
        animation: "aquish-wipe 220ms cubic-bezier(0.4,0,0.2,1) both",
      }}
    />
  );
}
