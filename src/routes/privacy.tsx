import { createFileRoute, Link } from "@tanstack/react-router";
import { useSiteContent } from "@/lib/site-content";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "AQUISH — PRIVACY" },
      { name: "description", content: "How AQUISH collects, uses and protects your personal information. We never sell your data." },
      { property: "og:title", content: "AQUISH — PRIVACY" },
      { property: "og:description", content: "Privacy policy for AQUISH customers." },
      { property: "og:url", content: "https://instant-peek-engine.lovable.app/privacy" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://instant-peek-engine.lovable.app/privacy" }],
  }),
  component: Page,
});

function Page() {
  const { content } = useSiteContent();
  return (
    <div className="min-h-screen aquish-bg aquish-fade-in flex flex-col">
      <header className="h-12 flex items-center px-4" style={{ borderBottom: "1px solid #000" }}>
        <Link to="/" className="aquish-link text-xs tracking-widest">← AQUISH</Link>
      </header>
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 flex flex-col gap-6 tracking-widest leading-relaxed" style={{ fontSize: 10, fontWeight: 400 }}>
        <h1 style={{ fontSize: 4.8, opacity: 0.6, fontWeight: 300, letterSpacing: "0.02em", wordSpacing: "-0.15em" }}>PRIVACY POLICY</h1>
        <p style={{ whiteSpace: "pre-wrap" }}>{content.privacy_body}</p>
      </main>
    </div>
  );
}
