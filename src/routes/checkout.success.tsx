import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
const formatPrice = (n: number) => `£${(n ?? 0).toFixed(2)}`;

function downloadInvoicePDF(opts: {
  invoiceNumber: string;
  orderNumber: string;
  row: OrderRow | null;
  items: OrderItem[];
  ship: any;
  statusLabel: string;
}) {
  const { invoiceNumber, orderNumber, row, items, ship, statusLabel } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  let y = 64;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("AQUISH", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("INVOICE", W - M, y, { align: "right" });
  y += 28;

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(M, y, W - M, y);
  y += 20;

  doc.setFontSize(9);
  const meta: [string, string][] = [
    ["INVOICE", invoiceNumber],
    ["ORDER", orderNumber],
    ["DATE", row?.created_at ? new Date(row.created_at).toLocaleString() : "—"],
    ["STATUS", statusLabel],
    ["EMAIL", row?.email ?? "—"],
    ["PAYMENT", (row?.payment_provider ?? "PAYFAST").toUpperCase()],
  ];
  meta.forEach(([k, v], i) => {
    const col = i % 2;
    const row_ = Math.floor(i / 2);
    const x = M + col * ((W - M * 2) / 2);
    const yy = y + row_ * 18;
    doc.setTextColor(120);
    doc.text(k, x, yy);
    doc.setTextColor(0);
    doc.text(String(v), x + 70, yy);
  });
  y += Math.ceil(meta.length / 2) * 18 + 14;

  doc.line(M, y, W - M, y);
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.text("ITEMS", M, y);
  doc.setFont("helvetica", "normal");
  y += 14;

  items.forEach((it) => {
    if (y > 740) {
      doc.addPage();
      y = 64;
    }
    doc.setFont("helvetica", "bold");
    doc.text(it.name.toUpperCase().slice(0, 60), M, y);
    doc.text(formatPrice(it.unitPriceGbp * it.qty), W - M, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    y += 12;
    doc.text(
      `SKU ${it.sku} · ${(it.color || "").toUpperCase()} · ${(it.size || "").toUpperCase()} · ×${it.qty}`,
      M,
      y,
    );
    doc.setTextColor(0);
    y += 16;
  });

  y += 6;
  doc.line(M, y, W - M, y);
  y += 18;
  const totals: [string, string][] = [
    ["SUBTOTAL", formatPrice(row?.subtotal ?? 0)],
  ];
  if (row && row.discount_amount > 0)
    totals.push([
      `DISCOUNT${row.discount_code ? ` (${row.discount_code})` : ""}`,
      `- ${formatPrice(row.discount_amount)}`,
    ]);
  totals.push(["SHIPPING", "CALCULATED"]);
  totals.forEach(([k, v]) => {
    doc.setTextColor(120);
    doc.text(k, M, y);
    doc.setTextColor(0);
    doc.text(v, W - M, y, { align: "right" });
    y += 14;
  });
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", M, y + 4);
  doc.text(formatPrice(row?.total ?? 0), W - M, y + 4, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 28;

  doc.line(M, y, W - M, y);
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.text("SHIP TO", M, y);
  doc.setFont("helvetica", "normal");
  y += 14;
  const lines = [
    `${ship.firstName ?? ""} ${ship.lastName ?? ""}`.trim(),
    `${ship.address ?? ""}${ship.apt ? `, ${ship.apt}` : ""}`,
    `${ship.city ?? ""}, ${ship.region ?? ""} ${ship.postal ?? ""}`,
    ship.country ?? "",
    ship.phone ?? "",
  ].filter(Boolean);
  lines.forEach((l) => {
    doc.text(l, M, y);
    y += 12;
  });

  y += 14;
  doc.setTextColor(120);
  doc.setFontSize(8);
  doc.text("Questions? aquishclothing@gmail.com", M, y);

  doc.save(`${invoiceNumber}.pdf`);
}


export const Route = createFileRoute("/checkout/success")({
  head: () => ({
    meta: [
      { title: "AQUISH — INVOICE" },
      { name: "description", content: "AQUISH order confirmation and invoice." },
    ],
  }),
  validateSearch: (s) =>
    z.object({ order: z.string().uuid().optional() }).parse(s),
  component: SuccessPage,
});

const STATUS_STEPS = ["pending", "paid", "processing", "shipped", "delivered"] as const;
type Status = (typeof STATUS_STEPS)[number] | string;

const STATUS_LABEL: Record<string, string> = {
  pending: "AWAITING PAYMENT",
  paid: "PAYMENT CONFIRMED",
  processing: "PREPARING ORDER",
  shipped: "SHIPPED",
  delivered: "DELIVERED",
  cancelled: "CANCELLED",
  refunded: "REFUNDED",
};

type OrderItem = {
  sku: string;
  name: string;
  color: string;
  size: string;
  qty: number;
  unitPriceGbp: number;
  productId?: string;
};

type OrderRow = {
  id: string;
  email: string;
  items: OrderItem[];
  subtotal: number;
  discount_amount: number;
  discount_code: string | null;
  total: number;
  currency: string;
  status: string;
  payment_provider: string | null;
  payment_reference: string | null;
  shipping_address: any;
  created_at: string;
  paid_at: string | null;
};

function SuccessPage() {
  const { order } = useSearch({ from: "/checkout/success" });
  const [row, setRow] = useState<OrderRow | null>(null);

  useEffect(() => {
    if (!order) return;
    let cancelled = false;

    const fetchOnce = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("id", order)
        .maybeSingle();
      if (!cancelled && data) setRow(data as any);
    };
    fetchOnce();

    const channel = supabase
      .channel(`order-${order}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${order}` },
        (payload) => !cancelled && setRow(payload.new as any),
      )
      .subscribe();

    const poll = setInterval(fetchOnce, 4000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [order]);

  const status: Status = row?.status ?? "pending";
  const paid = status !== "pending" && status !== "cancelled";
  const currentIdx = STATUS_STEPS.indexOf(status as any);
  const orderNumber = order
    ? `AQ-${order.replace(/-/g, "").slice(0, 8).toUpperCase()}`
    : "—";
  const invoiceNumber = order
    ? `INV-${order.replace(/-/g, "").slice(-8).toUpperCase()}`
    : "—";

  const ship = row?.shipping_address ?? {};
  const items = (row?.items ?? []) as OrderItem[];

  return (
    <div className="min-h-screen aquish-bg aquish-fade-in flex items-start justify-center px-6 py-16">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        {/* Check + title */}
        <div className="flex flex-col items-center gap-4">
          <div
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: "1.5px solid #000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12.5L10 17.5L19 7.5"
                stroke="#000"
                strokeWidth="1.6"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </svg>
          </div>
          <div className="text-xl tracking-widest text-center">
            {status === "cancelled"
              ? "ORDER CANCELLED"
              : paid
                ? "ORDER CONFIRMED"
                : "AWAITING CONFIRMATION"}
          </div>
          <div className="text-[10px] tracking-widest opacity-60">
            {STATUS_LABEL[status] ?? status.toUpperCase()}
          </div>
        </div>

        {/* Progress */}
        {status !== "cancelled" && status !== "refunded" && (
          <div className="flex items-center gap-1">
            {STATUS_STEPS.map((s, i) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: 2,
                  background: "#000",
                  opacity: i <= currentIdx ? 1 : 0.15,
                  transition: "opacity 400ms ease",
                }}
                title={STATUS_LABEL[s]}
              />
            ))}
          </div>
        )}

        {/* Invoice meta */}
        <div
          className="grid grid-cols-2 gap-y-3 gap-x-6 text-[10px] tracking-widest pt-4"
          style={{ borderTop: "1px solid rgba(0,0,0,0.2)" }}
        >
          <Field label="INVOICE">{invoiceNumber}</Field>
          <Field label="ORDER">{orderNumber}</Field>
          <Field label="DATE">
            {row?.created_at
              ? new Date(row.created_at).toLocaleString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </Field>
          <Field label="EMAIL">{row?.email ?? "—"}</Field>
          <Field label="PAYMENT">
            {(row?.payment_provider ?? "PAYFAST").toUpperCase()}
          </Field>
          <Field label="REFERENCE">
            {row?.payment_reference
              ? row.payment_reference.replace(/^EXPECTED_ZAR:/, "—") || "—"
              : "—"}
          </Field>
        </div>

        {/* Items */}
        <div className="flex flex-col gap-3 pt-2">
          <div className="text-[10px] tracking-widest opacity-60">ITEMS</div>
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.2)" }}>
            {items.length === 0 && (
              <div className="text-[10px] tracking-widest opacity-50 py-4">—</div>
            )}
            {items.map((it, i) => (
              <div
                key={i}
                className="grid grid-cols-12 gap-3 py-3 text-[10px] tracking-widest"
                style={{ borderBottom: "1px solid rgba(0,0,0,0.1)" }}
              >
                <div className="col-span-7">
                  <div style={{ fontWeight: 600 }}>{it.name.toUpperCase()}</div>
                  <div className="opacity-60 mt-1">
                    SKU {it.sku} · {it.color?.toUpperCase()} · {it.size?.toUpperCase()}
                  </div>
                  {it.productId && (
                    <div className="opacity-50 mt-0.5">
                      ID {it.productId.slice(0, 8).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="col-span-2 text-right opacity-70">×{it.qty}</div>
                <div className="col-span-3 text-right">
                  {formatPrice(it.unitPriceGbp * it.qty)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="flex flex-col gap-2 text-[10px] tracking-widest">
          <Row label="SUBTOTAL" value={formatPrice(row?.subtotal ?? 0)} />
          {row && row.discount_amount > 0 && (
            <Row
              label={`DISCOUNT${row.discount_code ? ` (${row.discount_code})` : ""}`}
              value={`− ${formatPrice(row.discount_amount)}`}
            />
          )}
          <Row label="SHIPPING" value="CALCULATED" />
          <div
            className="flex justify-between pt-3 mt-1"
            style={{ borderTop: "1px solid rgba(0,0,0,0.2)", fontWeight: 700 }}
          >
            <span>TOTAL</span>
            <span>{formatPrice(row?.total ?? 0)}</span>
          </div>
        </div>

        {/* Shipping address */}
        <div className="flex flex-col gap-2 pt-2">
          <div className="text-[10px] tracking-widest opacity-60">SHIP TO</div>
          <div
            className="text-[10px] tracking-widest leading-relaxed pt-2"
            style={{ borderTop: "1px solid rgba(0,0,0,0.2)" }}
          >
            {ship.firstName || ship.lastName ? (
              <>
                {(ship.firstName ?? "") + " " + (ship.lastName ?? "")}
                <br />
                {ship.address}
                {ship.apt ? `, ${ship.apt}` : ""}
                <br />
                {ship.city}, {ship.region} {ship.postal}
                <br />
                {ship.country}
                {ship.phone && (
                  <>
                    <br />
                    {ship.phone}
                  </>
                )}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>

        {/* Contact */}
        <div
          className="text-[10px] tracking-widest opacity-70 text-center pt-4"
          style={{ borderTop: "1px solid rgba(0,0,0,0.2)" }}
        >
          QUESTIONS? CONTACT{" "}
          <a
            href="mailto:aquishclothing@gmail.com"
            className="underline underline-offset-4"
          >
            AQUISHCLOTHING@GMAIL.COM
          </a>
          <div className="opacity-60 mt-2">
            A COPY OF THIS INVOICE HAS BEEN EMAILED TO {row?.email ?? "YOU"}.
          </div>
        </div>

        <div className="flex justify-center gap-6 pt-2">
          <button
            onClick={() =>
              downloadInvoicePDF({
                invoiceNumber,
                orderNumber,
                row,
                items,
                ship,
                statusLabel: STATUS_LABEL[status] ?? String(status).toUpperCase(),
              })
            }
            className="aquish-link text-[10px] tracking-widest underline underline-offset-4"
          >
            DOWNLOAD PDF
          </button>
          <button
            onClick={() => window.print()}
            className="aquish-link text-[10px] tracking-widest underline underline-offset-4"
          >
            PRINT
          </button>

          <Link
            to="/account"
            className="aquish-link text-[10px] tracking-widest underline underline-offset-4"
          >
            VIEW ORDERS
          </Link>
          <Link
            to="/"
            className="aquish-link text-[10px] tracking-widest underline underline-offset-4"
          >
            CONTINUE SHOPPING
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="opacity-50">{label}</span>
      <span style={{ fontWeight: 600 }}>{children}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="opacity-60">{label}</span>
      <span>{value}</span>
    </div>
  );
}
