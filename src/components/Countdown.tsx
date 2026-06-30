import { useEffect, useState } from "react";

export function Countdown({ target, label = "NEXT DROP" }: { target: string; label?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const t = new Date(target).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Math.max(0, t - now);
  if (diff === 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff / 3600000) % 24);
  const m = Math.floor((diff / 60000) % 60);
  const s = Math.floor((diff / 1000) % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex items-center justify-center gap-3 py-4 text-[11px] tracking-[0.25em]" style={{ borderBottom: "1px solid #000" }}>
      <span>{label}</span>
      <span>—</span>
      <span>{d}D {pad(h)}:{pad(m)}:{pad(s)}</span>
    </div>
  );
}
