import { createFileRoute, Link } from "@tanstack/react-router";
import { useSiteContent } from "@/lib/site-content";

export const Route = createFileRoute("/shipping")({
  head: () => ({
    meta: [
      { title: "AQUISH — SHIPPING" },
      { name: "description", content: "AQUISH ships domestically across South Africa within 3–5 business days. Tracking provided once your order is dispatched." },
      { property: "og:title", content: "AQUISH — SHIPPING" },
      { property: "og:description", content: "Domestic South African shipping. Dispatched within 3–5 business days with tracking." },
      { property: "og:url", content: "https://instant-peek-engine.lovable.app/shipping" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://instant-peek-engine.lovable.app/shipping" }],
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
        <h1 style={{ fontSize: 4.8, opacity: 0.6, fontWeight: 300, letterSpacing: "0.02em", wordSpacing: "-0.15em" }}>SHIPPING</h1>
        <p style={{ whiteSpace: "pre-wrap" }}>{content.shipping_body}</p>
      </main>
    </div>
  );
}
