import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Claim the admin role by providing the secret ADMIN_INVITE_CODE.
 * Must be called by an authenticated user. Comparison is constant-time-ish via
 * length check + char-by-char loop to reduce trivial timing leaks.
 */
export const claimAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const submitted = data.code.trim();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let granted = false;

    // 1) Environment master code(s) — comma-separated list supported.
    //    Accepts ADMIN_INVITE_CODE or ADMIN_SECRET_CODE (Vercel-friendly alias).
    const expectedRaw = process.env.ADMIN_INVITE_CODE ?? process.env.ADMIN_SECRET_CODE;
    if (expectedRaw) {
      const codes = expectedRaw.split(",").map((c) => c.trim()).filter(Boolean);
      const a = Buffer.from(submitted);
      for (const code of codes) {
        const b = Buffer.from(code);
        if (a.length !== b.length) continue;
        let ok = true;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) ok = false;
        if (ok) { granted = true; break; }
      }
    }

    // 2) Temporary invite codes (DB) — expires_at + max_uses respected
    if (!granted) {
      const { data: row } = await supabaseAdmin
        .from("admin_invite_codes")
        .select("*")
        .eq("code", submitted)
        .eq("active", true)
        .maybeSingle();
      if (row) {
        const notExpired = !row.expires_at || new Date(row.expires_at).getTime() > Date.now();
        const underCap = row.max_uses == null || row.used_count < row.max_uses;
        if (notExpired && underCap) {
          granted = true;
          await supabaseAdmin
            .from("admin_invite_codes")
            .update({ used_count: row.used_count + 1 })
            .eq("id", row.id);
        }
      }
    }

    if (!granted) return { ok: false as const };

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error && !String(error.message).toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
    return { ok: true as const };
  });


export const getMyAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { isAdmin: !!data };
  });
