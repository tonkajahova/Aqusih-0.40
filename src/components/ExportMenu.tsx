import { useEffect, useRef, useState } from "react";

export type ExportOption = { key: string; label: string; onSelect: () => void };

export function ExportMenu({
  label = "EXPORT",
  options,
  size = "md",
}: {
  label?: string;
  options: ExportOption[];
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pad = size === "sm" ? "px-2 py-1 text-[10px]" : "px-3 py-2";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`aquish-hover ${pad}`}
        style={{ border: "1px solid #000" }}
      >
        {label} ▾
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 z-50 min-w-[160px] flex flex-col"
          style={{ background: "#fff", border: "1px solid #000" }}
        >
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                setOpen(false);
                o.onSelect();
              }}
              className="text-left px-3 py-2 text-[11px] tracking-widest aquish-hover"
              style={{ borderBottom: "1px solid rgba(0,0,0,0.1)" }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
