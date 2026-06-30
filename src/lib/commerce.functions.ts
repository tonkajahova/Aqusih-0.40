import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Validate a discount code server-side. Returns the discount amount (in GBP base)
// or null if invalid/expired/exhausted.
export const validateDiscount = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        code: z.string().trim().min(1).max(64).toUpperCase(),
        subtotalGbp: z.number().nonnegative(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("discount_codes")
      .select("*")
      .eq("code", data.code)
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ok: false as const, reason: "INVALID CODE" };
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now())
      return { ok: false as const, reason: "EXPIRED" };
    if (row.max_uses != null && row.used_count >= row.max_uses)
      return { ok: false as const, reason: "FULLY REDEEMED" };

    let discount = 0;
    if (row.percent_off) discount = (data.subtotalGbp * Number(row.percent_off)) / 100;
    else if (row.amount_off) discount = Number(row.amount_off);
    discount = Math.min(discount, data.subtotalGbp);
    return {
      ok: true as const,
      code: row.code,
      discountGbp: Number(discount.toFixed(2)),
      label: row.percent_off
        ? `${Number(row.percent_off)}% OFF`
        : `£${Number(row.amount_off).toFixed(2)} OFF`,
    };
  });

const orderItemSchema = z.object({
  sku: z.string().max(64),
  name: z.string().max(200),
  color: z.string().max(64),
  size: z.string().max(32),
  qty: z.number().int().positive().max(99),
  unitPriceGbp: z.number().nonnegative(),
});

const shippingSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(200),
  apt: z.string().max(80).optional().default(""),
  city: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(80),
  postal: z.string().trim().min(1).max(20),
  country: z.string().trim().min(1).max(80),
  phone: z.string().max(40).optional().default(""),
});

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        items: z.array(orderItemSchema).min(1).max(100),
        shipping: shippingSchema,
        discountCode: z.string().trim().max(64).optional(),
        origin: z.string().trim().url().max(255),
        captchaToken: z.string().trim().max(4096).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { verifyCaptcha } = await import("./captcha.server");
    const ok = await verifyCaptcha(data.captchaToken);
    if (!ok) throw new Error("CAPTCHA VERIFICATION FAILED");

    const subtotal = data.items.reduce((n, it) => n + it.unitPriceGbp * it.qty, 0);

    let discountAmount = 0;
    let appliedCode: string | null = null;
    if (data.discountCode) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row } = await supabaseAdmin
        .from("discount_codes")
        .select("*")
        .eq("code", data.discountCode.toUpperCase())
        .eq("active", true)
        .maybeSingle();
      if (row) {
        const valid =
          (!row.expires_at || new Date(row.expires_at).getTime() >= Date.now()) &&
          (row.max_uses == null || row.used_count < row.max_uses);
        if (valid) {
          if (row.percent_off) discountAmount = (subtotal * Number(row.percent_off)) / 100;
          else if (row.amount_off) discountAmount = Number(row.amount_off);
          discountAmount = Math.min(discountAmount, subtotal);
          appliedCode = row.code;
          await supabaseAdmin
            .from("discount_codes")
            .update({ used_count: row.used_count + 1 })
            .eq("id", row.id);
        }
      }
    }

    const total = Math.max(0, subtotal - discountAmount);

    // PayFast operates in ZAR — convert from GBP base.
    const { convertGbpToZar, pfSignature, pfProcessUrl } = await import(
      "./payfast.server"
    );
    const zarTotal = await convertGbpToZar(total);

    const { data: order, error } = await context.supabase
      .from("orders")
      .insert({
        user_id: context.userId,
        email: data.email,
        items: data.items,
        subtotal: Number(subtotal.toFixed(2)),
        discount_code: appliedCode,
        discount_amount: Number(discountAmount.toFixed(2)),
        total: Number(total.toFixed(2)),
        currency: "GBP",
        shipping_address: data.shipping,
        status: "pending",
        payment_provider: "payfast",
        payment_reference: `EXPECTED_ZAR:${zarTotal.toFixed(2)}`,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const origin = data.origin.replace(/\/$/, "");
    const merchantId = process.env.PAYFAST_MERCHANT_ID;
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
    const passphrase = process.env.PAYFAST_PASSPHRASE;
    if (!merchantId || !merchantKey) {
      throw new Error("PayFast credentials are not configured.");
    }

    const itemName = `AQUISH ORDER ${order.id.slice(0, 8).toUpperCase()}`;
    const fields: Record<string, string> = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: `${origin}/checkout/success?order=${order.id}`,
      cancel_url: `${origin}/checkout?cancelled=1`,
      notify_url: `${origin}/api/public/payfast-itn`,
      name_first: data.shipping.firstName,
      name_last: data.shipping.lastName,
      email_address: data.email,
      m_payment_id: order.id,
      amount: zarTotal.toFixed(2),
      item_name: itemName,
      item_description: `${data.items.length} item(s)`,
      custom_str1: zarTotal.toFixed(2),
    };
    fields.signature = pfSignature(fields, passphrase);

    // Request an Onsite Payments UUID so the customer pays inside a modal
    // instead of being redirected away. Fall back to redirect URL if onsite fails.
    const { pfMode } = await import("./payfast.server");
    const onsiteUrl =
      pfMode() === "live"
        ? "https://www.payfast.co.za/onsite/process"
        : "https://sandbox.payfast.co.za/onsite/process";
    let uuid: string | null = null;
    try {
      const body = new URLSearchParams(fields).toString();
      const r = await fetch(onsiteUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const j: any = await r.json();
        if (j?.uuid) uuid = String(j.uuid);
      }
    } catch {}

    return {
      ok: true as const,
      orderId: order.id,
      payfast: { url: pfProcessUrl(), fields, uuid },
    };
  });

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("orders")
      .select("id, email, items, subtotal, discount_code, discount_amount, total, currency, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const adminDeleteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminCreateManualOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        total: z.number().nonnegative(),
        currency: z.string().trim().min(1).max(8).default("GBP"),
        status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled"]).default("paid"),
        note: z.string().max(500).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: context.userId,
        email: data.email,
        items: [
          {
            sku: "MANUAL",
            name: data.note || "MANUAL ADJUSTMENT",
            color: "",
            size: "",
            qty: 1,
            unitPriceGbp: data.total,
          },
        ],
        subtotal: data.total,
        discount_amount: 0,
        total: data.total,
        currency: data.currency.toUpperCase(),
        shipping_address: { manual: true },
        status: data.status,
        payment_provider: "manual",
        payment_reference: data.note || null,
        paid_at: data.status === "paid" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: row.id };
  });


// --- Refunds (stored in site_content as key=refund_<id>, value=JSON) ---
function makeRefundId() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
}

export const adminListRefunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("site_content")
      .select("key, value")
      .like("key", "refund_%");
    if (error) throw new Error(error.message);
    const list = (data ?? [])
      .map((r: any) => {
        try {
          const parsed = JSON.parse(r.value || "{}");
          return { key: r.key as string, ...parsed };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{
        key: string;
        id: string;
        orderId?: string;
        amount: number;
        currency: string;
        reason?: string;
        createdAt: string;
      }>;
    list.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    return list;
  });

export const adminCreateRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().trim().max(64).optional().default(""),
        amount: z.number().positive(),
        currency: z.string().trim().min(1).max(8).default("GBP"),
        reason: z.string().trim().max(500).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = makeRefundId();
    const payload = {
      id,
      orderId: data.orderId || "",
      amount: Number(data.amount.toFixed(2)),
      currency: data.currency.toUpperCase(),
      reason: data.reason,
      createdAt: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin
      .from("site_content")
      .upsert({ key: `refund_${id}`, value: JSON.stringify(payload) }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true as const, id };
  });

export const adminDeleteRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ key: z.string().min(1).max(128) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.key.startsWith("refund_")) throw new Error("Invalid key");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("site_content").delete().eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// --- Admin: update order status / tracking; emails customer ---
export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "paid", "processing", "shipped", "delivered", "cancelled", "failed"]),
        trackingNumber: z.string().trim().max(120).optional().default(""),
        notify: z.boolean().optional().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      status: string;
      paid_at?: string;
      payment_reference?: string;
    } = { status: data.status };
    if (data.status === "paid") patch.paid_at = new Date().toISOString();
    if (data.trackingNumber) patch.payment_reference = data.trackingNumber;
    const { data: row, error } = await supabaseAdmin
      .from("orders")
      .update(patch)
      .eq("id", data.id)
      .select("id, email, status")
      .single();
    if (error) throw new Error(error.message);

    if (data.notify && row?.email) {
      const { sendEmail, orderStatusHtml } = await import("./email.server");
      await sendEmail({
        to: row.email,
        subject: `AQUISH — ORDER ${data.status.toUpperCase()}`,
        html: orderStatusHtml({
          orderId: row.id,
          status: data.status,
          trackingNumber: data.trackingNumber || undefined,
        }),
      });
    }
    return { ok: true as const };
  });
