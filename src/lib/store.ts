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
const CATALOG_KEY = "aquish_catalog_local_v1";

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
type PersistedCatalog = Pick<State, "categories" | "products" | "dropAt">;

function readLocalCatalog(): PersistedCatalog | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      products: Array.isArray(parsed.products) ? parsed.products.map((p: any) => ({
        id: p.id,
        sku: p.sku ?? "",
        name: p.name ?? "",
        price: typeof p.price === "string" ? p.price : "",
        description: p.description ?? "",
        categoryId: p.categoryId ?? p.category_id ?? "",
        colors: Array.isArray(p.colors) ? p.colors : [],
        sizes: Array.isArray(p.sizes) ? p.sizes : [],
        stock: p.stock ?? 0,
        lowStockThreshold: p.lowStockThreshold ?? p.low_stock_threshold ?? 3,
        status: p.status === "published" ? "published" : "draft",
        order: p.order ?? 0,
        tags: Array.isArray(p.tags) ? p.tags : [],
        styles: Array.isArray(p.styles) ? p.styles : [],
      })) : [],
      dropAt: parsed.dropAt || null,
    };
  } catch {
    return null;
  }
}

async function writeLocalCatalog(next: PersistedCatalog) {
  if (typeof window === "undefined") return;
  const products = await Promise.all(next.products.map((p) => persistProductImages(p)));
  try {
    localStorage.setItem(
      CATALOG_KEY,
      JSON.stringify({ categories: next.categories, products, dropAt: next.dropAt }),
    );
  } catch (err) {
    console.error("[catalog] local save failed", err);
    throw new Error(
      "Local catalog storage is full. Remove a few product images or clear old site data, then try again.",
    );
  }
}

async function commitCatalogState(next: State) {
  await writeLocalCatalog({ categories: next.categories, products: next.products, dropAt: next.dropAt });
  state = next;
  emit();
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

// --- Catalogue load ---
let loadingPromise: Promise<void> | null = null;

export async function loadFromCloud() {
  if (typeof window === "undefined") return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const local = readLocalCatalog();
    if (local) {
      const hydrated = await Promise.all(local.products.map((p) => hydrateProductImages(p)));
      setState((s) => ({
        ...s,
        categories: local.categories,
        products: hydrated,
        dropAt: local.dropAt,
        loaded: true,
      }));
      return;
    }

    // First-run import from the existing backend catalogue only. After this,
    // admin edits are written locally (metadata in localStorage, images in IDB)
    // so product images are never pushed through JSON/API request limits.
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
    await commitCatalogState({ ...state, categories, products: hydrated, dropAt: dropRaw || null, loaded: true });
  })().finally(() => { loadingPromise = null; });
  return loadingPromise;
}

// --- One-time migration from old localStorage to the local catalogue ---
export async function migrateLocalToCloud(): Promise<{ migrated: number } | null> {
  if (typeof window === "undefined") return null;
  let legacy: any = null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) legacy = JSON.parse(raw);
  } catch {}
  if (!legacy || (!legacy.products?.length && !legacy.categories?.length)) return null;
  if (state.categories.length > 0 || state.products.length > 0) {
    // Catalogue already has data — don't overwrite. Mark legacy consumed.
    localStorage.removeItem(LEGACY_KEY);
    return null;
  }
  const categories: Category[] = Array.isArray(legacy.categories)
    ? legacy.categories.map((c: any) => ({ id: c.id, name: c.name, order: c.order ?? 0 }))
    : [];
  const products: Product[] = Array.isArray(legacy.products)
    ? legacy.products.map((p: any) => ({
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
    }))
    : [];
  const hydrated = await Promise.all(products.map((p) => hydrateProductImages(p)));
  await commitCatalogState({ ...state, categories, products: hydrated, dropAt: legacy.dropAt || null, loaded: true });
  localStorage.removeItem(LEGACY_KEY);
  return { migrated: products.length };
}

// --- Drop ---
export async function setDropAt(iso: string | null) {
  await commitCatalogState({ ...state, dropAt: iso });
}

// --- Categories ---
export async function addCategory(name: string) {
  const order = state.categories.length;
  await commitCatalogState({
    ...state,
    categories: [...state.categories, { id: crypto.randomUUID(), name: name.toUpperCase(), order }],
  });
}
export async function deleteCategory(id: string) {
  await commitCatalogState({
    ...state,
    categories: state.categories.filter((c) => c.id !== id),
    products: state.products.filter((p) => p.categoryId !== id),
  });
}

// --- Products ---
export async function upsertProduct(p: Product) {
  // Move inline data-URL images into IndexedDB and write only short refs to
  // localStorage — this keeps metadata small and avoids API/request limits.
  const persisted = await persistProductImages(p);
  const hydrated = await hydrateProductImages(persisted);
  const idx = state.products.findIndex((x) => x.id === p.id);
  const products = idx === -1 ? [...state.products, hydrated] : [...state.products];
  if (idx !== -1) products[idx] = hydrated;
  await commitCatalogState({ ...state, products, loaded: true });
}
export async function deleteProduct(id: string) {
  await commitCatalogState({ ...state, products: state.products.filter((p) => p.id !== id) });
}
export async function deleteProducts(ids: string[]) {
  await commitCatalogState({
    ...state,
    products: state.products.filter((p) => !ids.includes(p.id)),
  });
}
export async function reorderProducts(categoryId: string, orderedIds: string[]) {
  await commitCatalogState({
    ...state,
    products: state.products.map((p) => {
      if (p.categoryId !== categoryId) return p;
      const i = orderedIds.indexOf(p.id);
      return i === -1 ? p : { ...p, order: i };
    }),
  });
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
