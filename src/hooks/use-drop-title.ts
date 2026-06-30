import { useEffect } from "react";
import { dropDiffMs, formatDropCountdown, getDropUrgency } from "@/lib/drop-time";

/**
 * Mutates document.title to a live countdown when any drop is in its final 10 minutes.
 * Restores the original title when nothing is imminent.
 */
export function useDropTitle(dropIsoList: (string | null | undefined)[]) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const original = document.title;
    const valid = dropIsoList.filter((d): d is string => !!d);
    if (valid.length === 0) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      let imminent: { diff: number } | null = null;
      for (const iso of valid) {
        const diff = dropDiffMs(iso);
        if (diff > 0 && diff <= 10 * 60 * 1000) {
          if (!imminent || diff < imminent.diff) imminent = { diff };
        }
      }
      if (imminent) {
        const urgency = getDropUrgency(imminent.diff);
        const flash = urgency === "huge" && Math.floor(Date.now() / 500) % 2 === 0 ? "🔴 " : "";
        document.title = `${flash}(${formatDropCountdown(imminent.diff)}) DROPPING — AQUISH`;
      } else {
        document.title = original;
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.title = original;
    };
  }, [dropIsoList.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
}
