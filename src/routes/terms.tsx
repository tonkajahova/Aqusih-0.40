import { createFileRoute, Link } from "@tanstack/react-router";
import { useSiteContent } from "@/lib/site-content";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "AQUISH — TERMS" },
      { name: "description", content: "AQUISH terms of service covering orders, payments, intellectual property and our all-sales-final policy." },
      { property: "og:title", content: "AQUISH — TERMS" },
      { property: "og:description", content: "Terms of service for shopping with AQUISH." },
      { property: "og:url", content: "https://instant-peek-engine.lovable.app/terms" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://instant-peek-engine.lovable.app/terms" }],
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
        <h1 style={{ fontSize: 4.8, opacity: 0.6, fontWeight: 300, letterSpacing: "0.02em", wordSpacing: "-0.15em" }}>TERMS OF SERVICE</h1>
        <p style={{ whiteSpace: "pre-wrap" }}>{content.terms_body}</p>
      </main>
    </div>
  );
}
