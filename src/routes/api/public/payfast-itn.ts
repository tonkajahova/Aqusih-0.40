import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/payfast-itn")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const params = new URLSearchParams(rawBody);
        const received: Record<string, string> = {};
        params.forEach((v, k) => (received[k] = v));

        const { pfSignature, pfValidateUrl } = await import(
          "@/lib/payfast.server"
        );
        const passphrase = process.env.PAYFAST_PASSPHRASE;

        // 1) Signature check
        const sigReceived = (received.signature ?? "").toLowerCase();
        const fieldsNoSig = { ...received };
        delete fieldsNoSig.signature;
        const sigExpected = pfSignature(fieldsNoSig, passphrase).toLowerCase();
        if (sigReceived !== sigExpected) {
          console.error("[payfast-itn] signature mismatch");
          return new Response("invalid signature", { status: 400 });
        }

        // 2) Server-to-server validation with PayFast
        try {
          const validate = await fetch(pfValidateUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: rawBody,
            signal: AbortSignal.timeout(8000),
          });
          const text = (await validate.text()).trim();
          if (!text.startsWith("VALID")) {
            console.error("[payfast-itn] validate failed:", text);
            return new Response("not valid", { status: 400 });
          }
        } catch (e) {
          console.error("[payfast-itn] validate error", e);
          return new Response("validate error", { status: 400 });
        }

        const orderId = received.m_payment_id;
        const pfPaymentId = received.pf_payment_id ?? "";
        const status = received.payment_status; // COMPLETE, FAILED, PENDING, CANCELLED
        const amountGross = parseFloat(received.amount_gross ?? "0");
        const expectedZar = parseFloat(received.custom_str1 ?? "0");

        if (!orderId) return new Response("missing order", { status: 400 });

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // 3) Amount sanity check
        if (Math.abs(amountGross - expectedZar) > 0.01) {
          await supabaseAdmin
            .from("orders")
            .update({ status: "amount_mismatch", payment_reference: pfPaymentId })
            .eq("id", orderId);
          return new Response("amount mismatch", { status: 400 });
        }

        const next =
          status === "COMPLETE"
            ? { status: "paid", paid_at: new Date().toISOString() }
            : status === "FAILED"
              ? { status: "failed" }
              : status === "CANCELLED"
                ? { status: "cancelled" }
                : { status: "pending" };

        const { error } = await supabaseAdmin
          .from("orders")
          .update({ ...next, payment_reference: pfPaymentId })
          .eq("id", orderId);
        if (error) {
          console.error("[payfast-itn] update error", error);
          return new Response("db error", { status: 500 });
        }

        // On successful payment: decrement stock + send confirmation email.
        if (status === "COMPLETE") {
          const { data: order } = await supabaseAdmin
            .from("orders")
            .select("id, email, items, total, currency")
            .eq("id", orderId)
            .single();
          if (order) {
            const items = (order.items as any[]) ?? [];
            for (const it of items) {
              if (!it?.sku || !it?.qty) continue;
              try {
                const { data: prod } = await supabaseAdmin
                  .from("products")
                  .select("id, stock")
                  .eq("sku", it.sku)
                  .maybeSingle();
                if (prod && typeof prod.stock === "number") {
                  await supabaseAdmin
                    .from("products")
                    .update({ stock: Math.max(0, prod.stock - Number(it.qty)) })
                    .eq("id", prod.id);
                }
              } catch (e) {
                console.error("[payfast-itn] stock update failed", it.sku, e);
              }
            }
            try {
              const { sendEmail, orderConfirmationHtml } = await import(
                "@/lib/email.server"
              );
              await sendEmail({
                to: order.email,
                subject: `AQUISH — ORDER CONFIRMED #${order.id.slice(0, 8).toUpperCase()}`,
                html: orderConfirmationHtml({
                  orderId: order.id,
                  total: Number(order.total),
                  currency: String(order.currency || "GBP"),
                  items: items.map((it: any) => ({
                    name: String(it.name ?? it.sku ?? "ITEM"),
                    qty: Number(it.qty ?? 1),
                    unitPriceGbp: Number(it.unitPriceGbp ?? 0),
                    color: it.color,
                    size: it.size,
                  })),
                }),
              });
            } catch (e) {
              console.error("[payfast-itn] email send failed", e);
            }
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
