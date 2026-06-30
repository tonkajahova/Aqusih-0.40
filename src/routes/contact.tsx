import { createFileRoute, Link } from "@tanstack/react-router";
import { useSiteContent } from "@/lib/site-content";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "AQUISH — CONTACT" },
      { name: "description", content: "Get in touch with AQUISH for general enquiries, order support and press requests at aquishclothing@gmail.com." },
      { property: "og:title", content: "AQUISH — CONTACT" },
      { property: "og:description", content: "Reach AQUISH for enquiries, orders and press." },
      { property: "og:url", content: "https://instant-peek-engine.lovable.app/contact" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://instant-peek-engine.lovable.app/contact" }],
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
        <h1 style={{ fontSize: 4.8, opacity: 0.6, fontWeight: 300, letterSpacing: "0.02em", wordSpacing: "-0.15em" }}>CONTACT</h1>
        <p>GENERAL — {content.contact_general}</p>
        <p>ORDERS — {content.contact_orders}</p>
        <p>PRESS — {content.contact_press}</p>
      </main>
    </div>
  );
}
