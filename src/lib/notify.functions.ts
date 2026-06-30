import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Subscribe an email to be notified when a sold-out product is back in stock.
 * Open to unauthenticated visitors. Silently de-duplicates on (sku, email).
 */
export const subscribeRestockNotify = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        sku: z.string().min(1).max(100),
        email: z.string().email().max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Table types aren't regenerated yet for `notify_subscribers`; cast to bypass.
    const { error } = await (supabaseAdmin as unknown as {
      from: (t: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
    })
      .from("notify_subscribers")
      .insert({ product_sku: data.sku, email: data.email.toLowerCase().trim() });
    if (error && !String(error.message).toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
    return { ok: true as const };
  });
