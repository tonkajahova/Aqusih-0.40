// Resend transactional email helper. Server-only.

type SendArgs = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendArgs): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) {
    console.warn("[email] RESEND credentials missing — skipping send");
    return;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      console.error("[email] send failed", r.status, await r.text());
    }
  } catch (e) {
    console.error("[email] send error", e);
  }
}

const wrap = (body: string) => `
<!doctype html><html><body style="font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; background:#fff; color:#000; margin:0; padding:24px;">
<div style="max-width:560px;margin:0 auto;border:1px solid #000;padding:24px;">
<div style="font-size:14px;letter-spacing:0.3em;text-align:center;margin-bottom:16px;">AQUISH</div>
${body}
<div style="margin-top:24px;font-size:10px;letter-spacing:0.2em;opacity:0.6;text-align:center;">AQUISH · THANK YOU</div>
</div></body></html>`;

export function orderConfirmationHtml(args: {
  orderId: string;
  total: number;
  currency: string;
  items: Array<{ name: string; qty: number; unitPriceGbp: number; color?: string; size?: string }>;
}): string {
  const rows = args.items
    .map(
      (it) =>
        `<tr><td style="padding:6px 0;font-size:11px;">${it.name}${it.color ? ` · ${it.color}` : ""}${it.size ? ` · ${it.size}` : ""} × ${it.qty}</td><td style="padding:6px 0;font-size:11px;text-align:right;">£${(it.unitPriceGbp * it.qty).toFixed(2)}</td></tr>`,
    )
    .join("");
  return wrap(`
<div style="font-size:12px;letter-spacing:0.2em;margin-bottom:8px;">ORDER CONFIRMED</div>
<div style="font-size:11px;opacity:0.7;margin-bottom:16px;">ORDER #${args.orderId.slice(0, 8).toUpperCase()}</div>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #000;border-bottom:1px solid #000;margin-bottom:12px;">${rows}</table>
<div style="text-align:right;font-size:12px;">TOTAL ${args.currency} ${args.total.toFixed(2)}</div>
<div style="margin-top:18px;font-size:11px;">Your order is being prepared. You'll receive another email when it ships.</div>
`);
}

export function orderStatusHtml(args: {
  orderId: string;
  status: string;
  trackingNumber?: string;
}): string {
  const human = args.status.toUpperCase();
  return wrap(`
<div style="font-size:12px;letter-spacing:0.2em;margin-bottom:8px;">ORDER UPDATE</div>
<div style="font-size:11px;opacity:0.7;margin-bottom:16px;">ORDER #${args.orderId.slice(0, 8).toUpperCase()}</div>
<div style="font-size:14px;margin-bottom:12px;">STATUS: ${human}</div>
${args.trackingNumber ? `<div style="font-size:11px;">TRACKING: <strong>${args.trackingNumber}</strong></div>` : ""}
`);
}
