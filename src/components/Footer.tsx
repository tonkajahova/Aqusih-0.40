import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSiteContent, FOOTER_LINKS } from "@/lib/site-content";

export function Footer() {
  const { content } = useSiteContent();
  const [open, setOpen] = useState(false);
  const visible = FOOTER_LINKS.filter((l) => content[l.key] !== "0");
  const wa = content.social_whatsapp?.trim();
  const ig = content.social_instagram?.trim();
  if (visible.length === 0 && !wa && !ig) return null;
  return (
    <footer
      className="mt-8 px-4 py-6 flex flex-col items-center gap-4"
      style={{ fontSize: 11, letterSpacing: "0.1138em", lineHeight: 1.4 }}
    >
      {visible.length > 0 && (
        <div className="flex items-center justify-center gap-x-6 gap-y-2 flex-wrap">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="aquish-link tracking-widest"
            aria-expanded={open}
          >
            LEGAL
          </button>
          <nav
            className="flex items-center gap-x-6 overflow-hidden transition-all duration-300 ease-out"
            style={{
              maxWidth: open ? 800 : 0,
              opacity: open ? 1 : 0,
              pointerEvents: open ? "auto" : "none",
            }}
            aria-hidden={!open}
          >
            {visible.map((l) => (
              <Link key={l.key} to={l.to} className="aquish-link whitespace-nowrap">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
      {(wa || ig) && (
        <div className="flex items-center gap-5" style={{ transform: "translateY(20%)" }}>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="aquish-link inline-flex">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.52 3.48A11.86 11.86 0 0 0 12.04 0C5.5 0 .2 5.3.2 11.84c0 2.09.55 4.12 1.6 5.92L0 24l6.4-1.68a11.83 11.83 0 0 0 5.64 1.44h.01c6.54 0 11.84-5.3 11.84-11.84 0-3.17-1.24-6.14-3.37-8.44ZM12.04 21.5h-.01a9.66 9.66 0 0 1-4.92-1.35l-.35-.21-3.8 1 1.01-3.7-.23-.38a9.65 9.65 0 0 1-1.49-5.15c0-5.34 4.35-9.69 9.69-9.69 2.59 0 5.02 1.01 6.85 2.84a9.62 9.62 0 0 1 2.84 6.85c0 5.34-4.35 9.69-9.59 9.79Zm5.6-7.27c-.31-.16-1.83-.9-2.11-1.01-.28-.1-.49-.16-.7.16-.21.31-.8 1.01-.98 1.22-.18.21-.36.23-.67.08-.31-.16-1.31-.48-2.49-1.54-.92-.82-1.54-1.84-1.72-2.15-.18-.31-.02-.48.14-.63.14-.14.31-.36.46-.54.16-.18.21-.31.31-.52.1-.21.05-.39-.03-.54-.08-.16-.7-1.69-.96-2.31-.25-.6-.5-.52-.7-.53l-.6-.01c-.21 0-.54.08-.83.39-.28.31-1.09 1.07-1.09 2.6 0 1.54 1.12 3.02 1.27 3.23.16.21 2.2 3.36 5.33 4.71.74.32 1.32.51 1.78.66.75.24 1.43.21 1.97.13.6-.09 1.83-.75 2.09-1.47.26-.72.26-1.34.18-1.47-.08-.13-.28-.21-.59-.36Z"/>
              </svg>
            </a>
          )}
          {ig && (
            <a href={ig} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="aquish-link inline-flex">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
              </svg>
            </a>
          )}
        </div>
      )}
    </footer>
  );
}
