import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { listMyOrders } from "@/lib/commerce.functions";
import { downloadInvoicePdf, type InvoiceOrder } from "@/lib/invoice";
import { useStore, getColorImages } from "@/lib/store";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "AQUISH — ACCOUNT" },
      { name: "description", content: "Your AQUISH account." },
    ],
  }),
  component: AccountPage,
});

type Order = {
  id: string;
  email: string;
  items: any;
  subtotal: number;
  discount_code: string | null;
  discount_amount: number;
  total: number;
  currency: string;
  status: string;
  created_at: string;
};

function AccountPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchOrders = useServerFn(listMyOrders);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const products = useStore((s) => s.products);
  const [tab, setTab] = useState<"overview" | "orders" | "password" | "support">("overview");
  const [resetStatus, setResetStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user && tab === "orders" && orders === null) {
      fetchOrders({}).then((d) => setOrders(d as Order[])).catch(() => setOrders([]));
    }
  }, [user, tab, orders, fetchOrders]);

  if (loading || !user) {
    return (
      <div className="min-h-screen aquish-bg flex items-center justify-center text-xs tracking-widest opacity-60">
        LOADING…
      </div>
    );
  }


  const sendReset = async () => {
    setResetStatus(null);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email!, {
      redirectTo: window.location.origin + "/account",
    });
    setResetStatus(error ? error.message.toUpperCase() : "EMAIL SENT");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const tabs = [
    { id: "overview", label: "OVERVIEW" },
    { id: "orders", label: "ORDERS" },
    { id: "password", label: "PASSWORD" },
    { id: "support", label: "SUPPORT" },
  ] as const;

  return (
    <div className="min-h-screen aquish-bg aquish-fade-in flex flex-col">
      <header
        className="grid grid-cols-3 items-center px-4 h-12"
        style={{ borderBottom: "1px solid #000" }}
      >
        <Link to="/" className="aquish-link text-xs tracking-widest">← AQUISH</Link>
        <div className="text-sm tracking-widest justify-self-center">ACCOUNT</div>
        <button onClick={signOut} className="aquish-link text-xs tracking-widest justify-self-end">
          SIGN OUT
        </button>
      </header>

      <div className="grid md:grid-cols-[220px_1fr] flex-1">
        <aside className="p-6 flex flex-col gap-3 text-xs tracking-widest" style={{ borderRight: "1px solid #000" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`aquish-link text-left ${tab === t.id ? "underline underline-offset-4" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </aside>

        <section className="p-6 md:p-10 text-xs tracking-widest flex flex-col gap-5 max-w-2xl">
          {tab === "overview" && (
            <>
              <div className="text-sm">OVERVIEW</div>
              <Row label="EMAIL" value={user.email ?? "—"} />
              <Row label="USER ID" value={user.id.slice(0, 8) + "…"} />
              <Row label="JOINED" value={new Date(user.created_at).toLocaleDateString()} />
            </>
          )}

          {tab === "orders" && (
            <>
              <div className="text-sm">ORDER HISTORY</div>
              {orders === null && <div className="opacity-60">LOADING…</div>}
              {orders && orders.length === 0 && <div className="opacity-60">NO ORDERS YET</div>}
              {orders && orders.map((o) => (
                <div key={o.id} className="flex flex-col gap-1 py-3" style={{ borderBottom: "1px solid #000" }}>
                  <div className="flex justify-between">
                    <span>AQ-{o.id.replace(/-/g, "").slice(0, 8).toUpperCase()}</span>
                    <span>{o.status.toUpperCase()}</span>
                  </div>
                  <div className="opacity-60">{new Date(o.created_at).toLocaleDateString()}</div>
                  <div>{Array.isArray(o.items) ? o.items.length : 0} ITEM(S)</div>
                  <div>£{Number(o.total).toFixed(2)}</div>
                  <button
                    onClick={() => {
                      const items = (Array.isArray(o.items) ? o.items : []).map((it: any) => {
                        const p = products.find((pp: any) => pp.sku === it.sku);
                        const img = getColorImages(p?.colors?.find((c: any) => c.name === it.color))[0] ?? getColorImages(p?.colors?.[0])[0] ?? null;
                        return { ...it, image: img };
                      });
                      downloadInvoicePdf({ ...(o as any), items } as InvoiceOrder);
                    }}
                    className="mt-2 self-start px-3 py-2 text-[10px] tracking-widest"
                    style={{ border: "1px solid #000" }}
                  >
                    DOWNLOAD INVOICE
                  </button>
                </div>
              ))}
            </>
          )}

          {tab === "password" && (
            <>
              <div className="text-sm">PASSWORD</div>
              <p className="opacity-70 leading-relaxed">
                FOR YOUR SECURITY, PASSWORD CHANGES REQUIRE EMAIL VERIFICATION. CLICK BELOW AND WE'LL SEND A SECURE LINK TO {user.email?.toUpperCase()}. OPEN IT TO SET A NEW PASSWORD.
              </p>
              <button
                onClick={sendReset}
                className="py-3 text-xs tracking-widest"
                style={{ background: "#000", color: "#fff", border: "none" }}
              >
                SEND VERIFICATION LINK
              </button>
              {resetStatus && <div className="opacity-70">{resetStatus}</div>}
            </>
          )}

          {tab === "support" && (
            <>
              <div className="text-sm">SUPPORT</div>
              <p className="leading-relaxed">
                FOR ANY ISSUE WITH AN ORDER OR PRODUCT, REACH OUT BELOW. WE REPLY WITHIN 1–2 BUSINESS DAYS.
              </p>
              <Row label="GENERAL" value="AQUISHCLOTHING@GMAIL.COM" />
              <Row label="ORDERS" value="AQUISHCLOTHING@GMAIL.COM" />

              <a
                href="mailto:aquishclothing@gmail.com"
                className="mt-2 py-3 px-4 text-xs tracking-widest aquish-btn-primary inline-block text-center"
                style={{ background: "#000", color: "#fff", border: "none" }}
              >
                CONTACT SUPPORT
              </a>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2" style={{ borderBottom: "1px solid #000" }}>
      <span className="opacity-60">{label}</span>
      <span>{value}</span>
    </div>
  );
}
