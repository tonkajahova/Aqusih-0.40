import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listProductReviews = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ productId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: rows, error } = await supabase
      .from("product_reviews")
      .select("id, rating, title, body, created_at, user_id")
      .eq("product_id", data.productId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      productId: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
      title: z.string().trim().max(120).optional().default(""),
      body: z.string().trim().max(2000).optional().default(""),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("product_reviews").upsert({
      product_id: data.productId,
      user_id: context.userId,
      rating: data.rating,
      title: data.title || "",
      body: data.body || "",
    }, { onConflict: "product_id,user_id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteMyReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ productId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("product_reviews")
      .delete()
      .eq("product_id", data.productId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
