import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { hydrateProductImages, persistProductImages } from "@/lib/image-store";

export type ColorVariant = {
  id: string;
  name: string;
  swatch: string;
  /** Legacy single image (kept for backward compatibility). Prefer `images`. */
  image?: string;
  /** Multiple images for this colour (data URLs). */
  images?: string[];
};

/** Return all images for a colour, preferring `images[]` but falling back to legacy `image`. */
export function getColorImages(
  c?: Pick<ColorVariant, "image" | "images"> | null,
): string[] {
  if (!c) return [];
  if (Array.isArray(c.images) && c.images.length) return c.images.filter(Boolean);
  if (c.image) return [c.image];
  return [];
}

export type Product = {
  id: string;
  sku: string;
  name: string;
  price: string;
  description: string;
  categoryId: string;
  colors: ColorVariant[];
  sizes: string[];
  stock: number;
  lowStockThreshold: number;
  status: "draft" | "published";
  order: number;
  tags: string[];
  styles: Style[];
};

export type Category = { id: string; name: string; order: number };

export type Style = {
  id: string;
  name: string;
  colors: ColorVariant[];
};

/**
 * Return every colour for a product (flattened across styles + direct colours).
 * Styles come first, then any standalone colours. Used by the bag, detail view
 * and the hover-cycle on cards.
 */
export function getAllColors(
  p: Pick<Product, "colors" | "styles">,
): ColorVariant[] {
  const fromStyles = (p.styles ?? []).flatMap((s) => s.colors ?? []);
  return [...fromStyles, ...(p.colors ?? [])];
}

export type BagItem = {
  productId: string;
  colorId: string;
  size: string;
  qty: number;
};

type State = {
  categories: Category[];
  products: Product[];
  bag: BagItem[];
  dropAt: string | null;
  loaded: boolean;
};

const BAG_KEY = "aquish_bag_v1";
const LEGACY_KEY = "aquish_state_v1";

const defaultState = (): State => ({
  categories: [],
  products: [],
  bag: [],
  dropAt: null,
  loaded: false,
});

const SERVER_STATE: State = defaultState();

let state: State = (() => {
  if (typeof window === "undefined") return SERVER_STATE;
  const s = defaultState();
  try {
    const raw = localStorage.getItem(BAG_KEY);
    if (raw) s.bag = JSON.parse(raw);
  } catch {}
  return s;
})();

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function persistBag() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(BAG_KEY, JSON.stringify(state.bag)); } catch {}
}
function setState(updater: (s: State) => State) {
  state = updater(state);
  emit();
}

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function getState() { return state; }

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => selector(state),
    () => selector(SERVER_STATE),
  );
}

// --- Mapping ---
function rowToProduct(r: any): Product {
  return {
    id: r.id,
    sku: r.sku ?? "",
    name: r.name ?? "",
    price: r.price ?? "",
    description: r.description ?? "",
    categoryId: r.category_id ?? "",
    colors: Array.isArray(r.colors) ? r.colors : [],
    sizes: Array.isArray(r.sizes) ? r.sizes : [],
    stock: r.stock ?? 0,
    lowStockThreshold: r.low_stock_threshold ?? 3,
    status: r.status === "published" ? "published" : "draft",
    order: r.order ?? 0,
    tags: Array.isArray(r.tags) ? r.tags : [],
    styles: Array.isArray(r.styles) ? r.styles : [],
  };
}
function productToRow(p: Product) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    price: p.price,
    description: p.description,
    category_id: p.categoryId || null,
    colors: p.colors,
    sizes: p.sizes,
    stock: p.stock,
    low_stock_threshold: p.lowStockThreshold,
    status: p.status,
    order: p.order,
    tags: p.tags ?? [],
    styles: p.styles ?? [],
  };
}

// --- Cloud load ---
let loadingPromise: Promise<void> | null = null;

export async function loadFromCloud() {
  if (typeof window === "undefined") return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const [catsR, prodsR, dropR] = await Promise.all([
      supabase.from("categories").select("*").order("order", { ascending: true }),
      supabase.from("products").select("*").order("order", { ascending: true }),
      supabase.from("site_content").select("value").eq("key", "drop_at").maybeSingle(),
    ]);
    const categories: Category[] = (catsR.data ?? []).map((c: any) => ({
      id: c.id, name: c.name, order: c.order ?? 0,
    }));
    const products: Product[] = (prodsR.data ?? []).map(rowToProduct);
    const dropRaw = dropR.data?.value ?? "";
    const hydrated = await Promise.all(products.map((p) => hydrateProductImages(p)));
    setState((s) => ({ ...s, categories, products: hydrated, dropAt: dropRaw || null, loaded: true }));
  })().finally(() => { loadingPromise = null; });
  return loadingPromise;
}

// --- One-time migration from old localStorage to cloud (admin only) ---
export async function migrateLocalToCloud(): Promise<{ migrated: number } | null> {
  if (typeof window === "undefined") return null;
  let legacy: any = null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) legacy = JSON.parse(raw);
  } catch {}
  if (!legacy || (!legacy.products?.length && !legacy.categories?.length)) return null;
  if (state.categories.length > 0 || state.products.length > 0) {
    // Cloud already has data — don't overwrite. Mark legacy consumed.
    localStorage.removeItem(LEGACY_KEY);
    return null;
  }
  // Push categories first (preserve ids)
  if (Array.isArray(legacy.categories) && legacy.categories.length) {
    await supabase.from("categories").upsert(
      legacy.categories.map((c: any) => ({ id: c.id, name: c.name, order: c.order ?? 0 })),
      { onConflict: "id" },
    );
  }
  let migrated = 0;
  if (Array.isArray(legacy.products) && legacy.products.length) {
    const rows = legacy.products.map((p: any) =>
      productToRow({
        id: p.id,
        sku: p.sku ?? "",
        name: p.name ?? "",
        price: typeof p.price === "string" ? p.price : "",
        description: p.description ?? "",
        categoryId: p.categoryId ?? "",
        colors: p.colors ?? [],
        sizes: p.sizes ?? [],
        stock: p.stock ?? 0,
        lowStockThreshold: p.lowStockThreshold ?? 3,
        status: p.status === "published" ? "published" : "draft",
        order: p.order ?? 0,
        tags: Array.isArray(p.tags) ? p.tags : [],
        styles: Array.isArray(p.styles) ? p.styles : [],
      }),
    );
    const { error } = await supabase.from("products").upsert(rows, { onConflict: "id" });
    if (!error) migrated = rows.length;
  }
  if (legacy.dropAt) {
    await supabase.from("site_content").upsert({ key: "drop_at", value: legacy.dropAt }, { onConflict: "key" });
  }
  localStorage.removeItem(LEGACY_KEY);
  await loadFromCloud();
  return { migrated };
}

// --- Drop ---
export async function setDropAt(iso: string | null) {
  setState((s) => ({ ...s, dropAt: iso }));
  await supabase.from("site_content").upsert({ key: "drop_at", value: iso ?? "" }, { onConflict: "key" });
}

// --- Categories ---
export async function addCategory(name: string) {
  const order = state.categories.length;
  const { data } = await supabase
    .from("categories")
    .insert({ name: name.toUpperCase(), order })
    .select()
    .single();
  if (data) {
    setState((s) => ({
      ...s,
      categories: [...s.categories, { id: data.id, name: data.name, order: data.order ?? order }],
    }));
  }
}
export async function deleteCategory(id: string) {
  await supabase.from("categories").delete().eq("id", id);
  setState((s) => ({
    ...s,
    categories: s.categories.filter((c) => c.id !== id),
    products: s.products.filter((p) => p.categoryId !== id),
  }));
}

// --- Products ---
export async function upsertProduct(p: Product) {
  // Move inline data-URL images into IndexedDB and write only short refs to
  // the database — this keeps the JSONB row tiny and avoids PostgREST size
  // limits when products have many high-res transparent PNGs.
  const persisted = await persistProductImages(p);
  const { error } = await supabase
    .from("products")
    .upsert(productToRow(persisted), { onConflict: "id" });
  if (error) {
    // Surface the failure so the admin UI can show it instead of silently
    // adding the product to local state and having it vanish on the next
    // cloud reload.
    console.error("[upsertProduct] save failed", error);
    throw new Error(error.message || "Failed to save product");
  }
  setState((s) => {
    const idx = s.products.findIndex((x) => x.id === p.id);
    if (idx === -1) return { ...s, products: [...s.products, p] };
    const next = [...s.products];
    next[idx] = p;
    return { ...s, products: next };
  });
}
export async function deleteProduct(id: string) {
  await supabase.from("products").delete().eq("id", id);
  setState((s) => ({ ...s, products: s.products.filter((p) => p.id !== id) }));
}
export async function deleteProducts(ids: string[]) {
  await supabase.from("products").delete().in("id", ids);
  setState((s) => ({ ...s, products: s.products.filter((p) => !ids.includes(p.id)) }));
}
export async function reorderProducts(categoryId: string, orderedIds: string[]) {
  const updates = orderedIds.map((id, order) => ({ id, order }));
  // Update one-by-one to keep RLS happy without service role
  await Promise.all(
    updates.map((u) => supabase.from("products").update({ order: u.order }).eq("id", u.id)),
  );
  setState((s) => ({
    ...s,
    products: s.products.map((p) => {
      if (p.categoryId !== categoryId) return p;
      const i = orderedIds.indexOf(p.id);
      return i === -1 ? p : { ...p, order: i };
    }),
  }));
}

// --- Bag (local only) ---
export const addToBag = (item: BagItem) => {
  setState((s) => {
    const idx = s.bag.findIndex(
      (b) => b.productId === item.productId && b.colorId === item.colorId && b.size === item.size,
    );
    if (idx === -1) return { ...s, bag: [...s.bag, item] };
    const next = [...s.bag];
    next[idx] = { ...next[idx], qty: next[idx].qty + item.qty };
    return { ...s, bag: next };
  });
  persistBag();
};
export const removeFromBag = (idx: number) => {
  setState((s) => ({ ...s, bag: s.bag.filter((_, i) => i !== idx) }));
  persistBag();
};
export const updateBagQty = (idx: number, qty: number) => {
  setState((s) => ({
    ...s,
    bag: s.bag.map((b, i) => (i === idx ? { ...b, qty: Math.max(1, qty) } : b)),
  }));
  persistBag();
};
export const clearBag = () => {
  setState((s) => ({ ...s, bag: [] }));
  persistBag();
};
