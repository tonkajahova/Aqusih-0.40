// Local image store backed by IndexedDB.
//
// Product images are kept as data URLs in the browser only. The DB row
// stores a short reference (`idb:<id>`) instead of the full base64 blob,
// which keeps the JSONB payload well under PostgREST's request limit.
//
// Anything stored here is per-device. That matches the project's
// "no cloud storage" requirement — we sync the *catalogue* through the
// database, but the heavy image bytes live next to the admin's browser.

const DB_NAME = "aquish_images_v1";
const STORE = "images";
const REF_PREFIX = "idb:";

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

export function isImageRef(s: string | undefined | null): s is string {
  return typeof s === "string" && s.startsWith(REF_PREFIX);
}

export function isDataUrl(s: string | undefined | null): s is string {
  return typeof s === "string" && s.startsWith("data:");
}

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) return Promise.reject(new Error("IndexedDB unavailable"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<string | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Save a data URL to IndexedDB, return a short `idb:<id>` reference. */
export async function saveImage(dataUrl: string): Promise<string> {
  if (!isBrowser()) return dataUrl;
  if (isImageRef(dataUrl)) return dataUrl;
  if (!isDataUrl(dataUrl)) return dataUrl;
  const id = crypto.randomUUID();
  await idbPut(id, dataUrl);
  return REF_PREFIX + id;
}

/** Resolve a possible `idb:<id>` reference back to a data URL.
 *  Returns the input unchanged if it isn't a ref, or empty string if missing. */
export async function loadImage(ref: string): Promise<string> {
  if (!isImageRef(ref)) return ref;
  const id = ref.slice(REF_PREFIX.length);
  try {
    const v = await idbGet(id);
    return v ?? "";
  } catch {
    return "";
  }
}

// ---- Bulk helpers operating on the product shape ----

type ColorLike = { image?: string; images?: string[] };
type StyleLike = { colors?: ColorLike[] };
type ProductLike = { colors?: ColorLike[]; styles?: StyleLike[] };

async function mapImage(v: string | undefined, fn: (s: string) => Promise<string>) {
  if (!v) return v;
  return await fn(v);
}

async function transformColor(c: ColorLike, fn: (s: string) => Promise<string>): Promise<ColorLike> {
  const out: ColorLike = { ...c };
  if (c.image) out.image = await mapImage(c.image, fn);
  if (Array.isArray(c.images)) {
    out.images = (await Promise.all(c.images.map((i) => fn(i)))).filter(Boolean);
  }
  return out;
}

async function transformProduct<P extends ProductLike>(
  p: P,
  fn: (s: string) => Promise<string>,
): Promise<P> {
  const colors = await Promise.all((p.colors ?? []).map((c) => transformColor(c, fn)));
  const styles = await Promise.all(
    (p.styles ?? []).map(async (s) => ({
      ...s,
      colors: await Promise.all((s.colors ?? []).map((c) => transformColor(c, fn))),
    })),
  );
  return { ...p, colors, styles } as P;
}

/** Replace every data-URL image inside a product with a stored `idb:<id>` ref. */
export function persistProductImages<P extends ProductLike>(p: P): Promise<P> {
  return transformProduct(p, async (s) => (isDataUrl(s) ? await saveImage(s) : s));
}

/** Replace every `idb:<id>` ref inside a product with the resolved data URL. */
export function hydrateProductImages<P extends ProductLike>(p: P): Promise<P> {
  return transformProduct(p, async (s) => (isImageRef(s) ? await loadImage(s) : s));
}