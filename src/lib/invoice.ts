// Client-side PDF / CSV utilities for invoices, products, orders, and revenue.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type InvoiceItem = {
  sku: string;
  name?: string;
  color?: string | null;
  size?: string | null;
  qty: number;
  unitPriceGbp: number;
  image?: string | null;
};

export type InvoiceOrder = {
  id: string;
  email: string;
  items: InvoiceItem[];
  subtotal: number;
  discount_code?: string | null;
  discount_amount?: number;
  total: number;
  currency: string;
  status: string;
  created_at: string;
  shipping_address?: Record<string, string>;
};

const fmt = (n: number) => (Number(n) || 0).toFixed(2);
const shortId = (id: string) => "AQ-" + id.replace(/-/g, "").slice(0, 8).toUpperCase();

export function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Fetch product image as base64 data URL (best-effort; CORS may block).
async function imageToDataURL(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateInvoicePdf(order: InvoiceOrder): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("AQUISH", 40, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("INVOICE", W - 40, y, { align: "right" });

  y += 24;
  doc.setFontSize(9);
  doc.text(`Order: ${shortId(order.id)}`, 40, y);
  doc.text(`Date: ${new Date(order.created_at).toLocaleString()}`, 40, y + 12);
  doc.text(`Status: ${order.status.toUpperCase()}`, 40, y + 24);
  doc.text(`Email: ${order.email}`, W - 40, y, { align: "right" });

  const a = order.shipping_address || {};
  if (a.firstName || a.address) {
    y += 44;
    doc.setFont("helvetica", "bold");
    doc.text("SHIP TO", 40, y);
    doc.setFont("helvetica", "normal");
    const lines = [
      `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim(),
      `${a.address ?? ""} ${a.apt ?? ""}`.trim(),
      `${a.city ?? ""}, ${a.region ?? ""} ${a.postal ?? ""}`.trim(),
      a.country ?? "",
      a.phone ?? "",
    ].filter(Boolean);
    lines.forEach((l, i) => doc.text(l, 40, y + 12 + i * 12));
    y += 12 + lines.length * 12;
  } else {
    y += 36;
  }

  // Resolve images
  const imgs: (string | null)[] = await Promise.all(
    order.items.map((it) => (it.image ? imageToDataURL(it.image) : Promise.resolve(null))),
  );

  const body = order.items.map((it, i) => [
    "", // image col
    it.sku + (it.name ? `\n${it.name}` : ""),
    [it.color, it.size].filter(Boolean).join(" / ") || "—",
    String(it.qty),
    `£${fmt(it.unitPriceGbp)}`,
    `£${fmt(it.unitPriceGbp * it.qty)}`,
  ]);

  autoTable(doc, {
    startY: y + 10,
    head: [["", "ITEM", "VARIANT", "QTY", "UNIT", "TOTAL"]],
    body,
    styles: { fontSize: 9, cellPadding: 6, valign: "middle", minCellHeight: 44 },
    headStyles: { fillColor: [0, 0, 0], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 180 },
      2: { cellWidth: 90 },
      3: { cellWidth: 40, halign: "right" },
      4: { cellWidth: 60, halign: "right" },
      5: { cellWidth: 70, halign: "right" },
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const src = imgs[data.row.index];
        if (src) {
          try {
            const x = data.cell.x + 4;
            const yy = data.cell.y + 4;
            const s = Math.min(data.cell.width - 8, data.cell.height - 8);
            doc.addImage(src, "JPEG", x, yy, s, s);
          } catch {}
        }
      }
    },
  });

  const after = (doc as any).lastAutoTable.finalY + 20;
  doc.setFontSize(10);
  doc.text(`Subtotal: £${fmt(order.subtotal)}`, W - 40, after, { align: "right" });
  if (order.discount_code && (order.discount_amount ?? 0) > 0) {
    doc.text(`${order.discount_code}: −£${fmt(order.discount_amount ?? 0)}`, W - 40, after + 14, { align: "right" });
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`TOTAL: ${order.currency} ${fmt(order.total)}`, W - 40, after + 36, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Thank you for shopping with AQUISH.", 40, doc.internal.pageSize.getHeight() - 30);

  return doc;
}

export async function downloadInvoicePdf(order: InvoiceOrder) {
  const doc = await generateInvoicePdf(order);
  doc.save(`invoice-${shortId(order.id)}.pdf`);
}

export async function downloadInvoicesBulk(orders: InvoiceOrder[]) {
  if (orders.length === 0) return;
  if (orders.length === 1) return downloadInvoicePdf(orders[0]);
  const merged = new jsPDF({ unit: "pt", format: "a4" });
  let first = true;
  for (const o of orders) {
    const single = await generateInvoicePdf(o);
    const pages = single.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      if (!first) merged.addPage();
      first = false;
      // Re-render by copying via internal pages
      // jsPDF doesn't have a clean merge; redraw using setPage source -> not supported.
      // Workaround: convert page to image via output.
      // Simpler: render the invoice directly into merged.
    }
  }
  // Fallback simple bulk approach: render each invoice content into merged sequentially.
  const finalDoc = new jsPDF({ unit: "pt", format: "a4" });
  let isFirst = true;
  for (const o of orders) {
    if (!isFirst) finalDoc.addPage();
    isFirst = false;
    await renderInvoiceInto(finalDoc, o);
  }
  finalDoc.save(`invoices-bulk-${new Date().toISOString().slice(0, 10)}.pdf`);
}

async function renderInvoiceInto(doc: jsPDF, order: InvoiceOrder) {
  const W = doc.internal.pageSize.getWidth();
  let y = 40;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("AQUISH", 40, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("INVOICE", W - 40, y, { align: "right" });

  y += 24;
  doc.setFontSize(9);
  doc.text(`Order: ${shortId(order.id)}`, 40, y);
  doc.text(`Date: ${new Date(order.created_at).toLocaleString()}`, 40, y + 12);
  doc.text(`Status: ${order.status.toUpperCase()}`, 40, y + 24);
  doc.text(`Email: ${order.email}`, W - 40, y, { align: "right" });

  const a = order.shipping_address || {};
  y += 44;
  if (a.firstName || a.address) {
    doc.setFont("helvetica", "bold");
    doc.text("SHIP TO", 40, y);
    doc.setFont("helvetica", "normal");
    const lines = [
      `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim(),
      `${a.address ?? ""} ${a.apt ?? ""}`.trim(),
      `${a.city ?? ""}, ${a.region ?? ""} ${a.postal ?? ""}`.trim(),
      a.country ?? "",
    ].filter(Boolean);
    lines.forEach((l, i) => doc.text(l, 40, y + 12 + i * 12));
    y += 12 + lines.length * 12;
  }

  const imgs = await Promise.all(order.items.map((it) => (it.image ? imageToDataURL(it.image) : Promise.resolve(null))));
  const body = order.items.map((it) => [
    "",
    it.sku + (it.name ? `\n${it.name}` : ""),
    [it.color, it.size].filter(Boolean).join(" / ") || "—",
    String(it.qty),
    `£${fmt(it.unitPriceGbp)}`,
    `£${fmt(it.unitPriceGbp * it.qty)}`,
  ]);

  autoTable(doc, {
    startY: y + 10,
    head: [["", "ITEM", "VARIANT", "QTY", "UNIT", "TOTAL"]],
    body,
    styles: { fontSize: 9, cellPadding: 6, valign: "middle", minCellHeight: 44 },
    headStyles: { fillColor: [0, 0, 0], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 180 },
      2: { cellWidth: 90 },
      3: { cellWidth: 40, halign: "right" },
      4: { cellWidth: 60, halign: "right" },
      5: { cellWidth: 70, halign: "right" },
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const src = imgs[data.row.index];
        if (src) {
          try {
            const x = data.cell.x + 4;
            const yy = data.cell.y + 4;
            const s = Math.min(data.cell.width - 8, data.cell.height - 8);
            doc.addImage(src, "JPEG", x, yy, s, s);
          } catch {}
        }
      }
    },
  });

  const after = (doc as any).lastAutoTable.finalY + 20;
  doc.setFontSize(10);
  doc.text(`Subtotal: £${fmt(order.subtotal)}`, W - 40, after, { align: "right" });
  if (order.discount_code && (order.discount_amount ?? 0) > 0) {
    doc.text(`${order.discount_code}: −£${fmt(order.discount_amount ?? 0)}`, W - 40, after + 14, { align: "right" });
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`TOTAL: ${order.currency} ${fmt(order.total)}`, W - 40, after + 36, { align: "right" });
}

// --- Generic products / orders / revenue PDFs ---

export function exportProductsPdf(
  products: Array<{ sku: string; name: string; price: string; stock: number; status: string; categoryId?: string }>,
  categories: { id: string; name: string }[] = [],
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("AQUISH — PRODUCTS", 40, 40);
  autoTable(doc, {
    startY: 60,
    head: [["SKU", "NAME", "CATEGORY", "PRICE", "STOCK", "STATUS"]],
    body: products.map((p) => [
      p.sku,
      p.name,
      categories.find((c) => c.id === p.categoryId)?.name ?? "—",
      p.price,
      String(p.stock),
      p.status.toUpperCase(),
    ]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [0, 0, 0], textColor: 255 },
  });
  doc.save(`aquish-products-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportOrdersPdf(orders: InvoiceOrder[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("AQUISH — ORDERS", 40, 40);
  autoTable(doc, {
    startY: 60,
    head: [["ORDER", "DATE", "EMAIL", "ITEMS", "STATUS", "TOTAL"]],
    body: orders.map((o) => [
      shortId(o.id),
      new Date(o.created_at).toLocaleDateString(),
      o.email,
      String(o.items?.length ?? 0),
      o.status.toUpperCase(),
      `${o.currency} ${fmt(o.total)}`,
    ]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [0, 0, 0], textColor: 255 },
  });
  doc.save(`aquish-orders-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// --- Revenue trends ---

export type RevenueBucket = { label: string; orders: number; gross: number };

export function exportRevenueCsv(buckets: RevenueBucket[], currency: string, range: string) {
  const lines = ["period,orders,gross_" + currency.toLowerCase()];
  for (const b of buckets) lines.push(`${b.label},${b.orders},${b.gross.toFixed(2)}`);
  const total = buckets.reduce((s, b) => s + b.gross, 0);
  const totalOrders = buckets.reduce((s, b) => s + b.orders, 0);
  lines.push(`TOTAL,${totalOrders},${total.toFixed(2)}`);
  downloadBlob(lines.join("\n"), `aquish-revenue-${range}-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
}

export function exportRevenuePdf(buckets: RevenueBucket[], currency: string, range: string, from: string, to: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("AQUISH — REVENUE REPORT", 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Range: ${range.toUpperCase()}  ${from} → ${to}`, 40, 60);

  const total = buckets.reduce((s, b) => s + b.gross, 0);
  const totalOrders = buckets.reduce((s, b) => s + b.orders, 0);
  const aov = totalOrders > 0 ? total / totalOrders : 0;

  doc.text(`Orders: ${totalOrders}    Gross: ${currency} ${fmt(total)}    AOV: ${currency} ${fmt(aov)}`, 40, 78);

  autoTable(doc, {
    startY: 100,
    head: [["PERIOD", "ORDERS", `GROSS (${currency})`]],
    body: buckets.map((b) => [b.label, String(b.orders), fmt(b.gross)]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [0, 0, 0], textColor: 255 },
  });

  // Simple bar chart
  const after = (doc as any).lastAutoTable.finalY + 20;
  const chartX = 40, chartY = after, chartW = 500, chartH = 140;
  doc.rect(chartX, chartY, chartW, chartH);
  const max = Math.max(1, ...buckets.map((b) => b.gross));
  const bw = chartW / Math.max(1, buckets.length);
  buckets.forEach((b, i) => {
    const h = (b.gross / max) * (chartH - 10);
    doc.setFillColor(0, 0, 0);
    doc.rect(chartX + i * bw + bw * 0.15, chartY + chartH - h, bw * 0.7, h, "F");
  });
  doc.setFontSize(8);
  doc.text(`Trend (${range})`, chartX, chartY - 4);

  doc.save(`aquish-revenue-${range}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
