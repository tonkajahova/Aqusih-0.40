// Timezone-safe helpers for drop scheduling and countdown formatting.
//
// Storage convention: drop times are stored as ISO 8601 UTC strings (e.g.
// "2026-06-30T14:00:00.000Z"). The admin edits in their local timezone via a
// <input type="datetime-local"> control; we convert to/from UTC at the
// boundary so the same moment renders correctly for every viewer regardless
// of their browser timezone.

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Convert a stored UTC ISO string into the `YYYY-MM-DDTHH:mm` value expected
 * by <input type="datetime-local">, expressed in the viewer's local zone.
 * Returns "" for blank / invalid input.
 *
 * NOTE: A naive `iso.slice(0, 16)` is WRONG — it strips the trailing "Z" and
 * the input then interprets the wall-clock as local time, shifting the moment
 * by the viewer's UTC offset.
 */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Convert a `YYYY-MM-DDTHH:mm` local-time value from <input type="datetime-local">
 * into a UTC ISO string for storage. Returns "" for blank / invalid input.
 */
export function fromLocalInputValue(local: string | null | undefined): string {
  if (!local) return "";
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

export type DropUrgency = "none" | "soft" | "strong" | "huge";

/** Visual urgency tier based on remaining ms. */
export function getDropUrgency(diffMs: number): DropUrgency {
  if (diffMs <= 0) return "none";
  if (diffMs <= 60 * 1000) return "huge";
  if (diffMs <= 10 * 60 * 1000) return "strong";
  if (diffMs <= 60 * 60 * 1000) return "soft";
  return "none";
}

/**
 * Format the countdown label. Long drops (>72h) collapse hours into days+hours;
 * shorter drops display HH:MM:SS for live ticking.
 */
export function formatDropCountdown(diffMs: number): string {
  const diff = Math.max(0, diffMs);
  const totalHours = diff / 3600000;
  if (totalHours > 72) {
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff / 3600000) % 24);
    return `${d}D ${pad(h)}H`;
  }
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff / 60000) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Diff in ms between an ISO target and `now` (defaults to Date.now()). */
export function dropDiffMs(targetIso: string, now: number = Date.now()): number {
  const t = new Date(targetIso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, t - now);
}
