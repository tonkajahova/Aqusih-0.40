import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  useStore,
  addCategory,
  deleteCategory,
  upsertProduct,
  deleteProducts,
  reorderProducts,
  setDropAt,
  type Product,
  type ColorVariant,
  getColorImages,
  loadFromCloud,
  migrateLocalToCloud,
} from "@/lib/store";
import { useAuth } from "@/hooks/use-auth";
import { adminDeleteOrder, adminCreateManualOrder, adminListRefunds, adminCreateRefund, adminDeleteRefund, adminUpdateOrderStatus } from "@/lib/commerce.functions";
import { downloadInvoicePdf, downloadInvoicesBulk, exportOrdersPdf, exportProductsPdf, exportRevenueCsv, exportRevenuePdf, type InvoiceOrder, type RevenueBucket } from "@/lib/invoice";
import { ExportMenu } from "@/components/ExportMenu";

import { getMyAdminStatus, claimAdminRole } from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  useSiteContent,
  saveContent,
  CONTENT_FIELDS,
  UI_TOGGLES,
  productSaleKey,
  productDropKey,
  getProductSale,
  getProductDrop,
} from "@/lib/site-content";
import { toLocalInputValue, fromLocalInputValue } from "@/lib/drop-time";


export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "AQUISH — ADMIN" }] }),
  component: AdminGate,
});

function AdminGate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const checkAdmin = useServerFn(getMyAdminStatus);
  const claim = useServerFn(claimAdminRole);
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const runCheck = async () => {
    setState("checking");
    try {
      const r = await checkAdmin({});
      if (r.isAdmin) {
        await loadFromCloud();
        await migrateLocalToCloud().catch(() => null);
        setState("ok");
      } else setState("denied");
    } catch {
      setState("denied");
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    runCheck();
  }, [user, loading]);

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await claim({ data: { code: code.trim() } });
      if (r.ok) {
        setMsg("ADMIN ACCESS GRANTED");
        await runCheck();
      } else {
        setMsg("INCORRECT CODE");
      }
    } catch (err: any) {
      setMsg(err?.message ?? "SERVER ERROR — SERVICE ROLE KEY NOT CONFIGURED");
    } finally {
      setBusy(false);
    }
  };

  if (loading || state === "checking") {
    return <div className="min-h-screen aquish-bg flex items-center justify-center text-xs tracking-widest opacity-60">CHECKING…</div>;
  }
  if (state === "denied") {
    return (
      <div className="min-h-screen aquish-bg flex flex-col items-center justify-center gap-4 text-xs tracking-widest px-6">
        <div>ADMIN ACCESS REQUIRED</div>
        <form onSubmit={submitCode} className="flex flex-col gap-3 w-full max-w-xs">
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ENTER ADMIN CODE"
            className="aquish-input text-center"
            autoFocus
          />
          <button type="submit" disabled={busy} className="py-3 text-xs tracking-widest disabled:opacity-40" style={{ background: "#000", color: "#fff", border: "none" }}>
            {busy ? "…" : "SUBMIT"}
          </button>
          {msg && <div className="text-center opacity-80">{msg}</div>}
        </form>
        <button onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/auth" }))} className="aquish-link">SIGN OUT</button>
        <Link to="/" className="aquish-link">← STOREFRONT</Link>
      </div>
    );
  }
  return <Admin />;
}



function Admin() {
  const categoriesRaw = useStore((s) => s.categories);
  const products = useStore((s) => s.products);
  const categories = useMemo(
    () => [...categoriesRaw].sort((a, b) => a.order - b.order),
    [categoriesRaw],
  );


  const [newCat, setNewCat] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const currentCat = activeCat ?? categories[0]?.id ?? null;
  const catProducts = useMemo(
    () => products.filter((p) => p.categoryId === currentCat).sort((a, b) => a.order - b.order),
    [products, currentCat],
  );

  const toggleSel = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  // drag reorder
  const dragId = useRef<string | null>(null);
  const onDragStart = (id: string) => (dragId.current = id);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (overId: string) => {
    if (!dragId.current || dragId.current === overId || !currentCat) return;
    const ids = catProducts.map((p) => p.id);
    const from = ids.indexOf(dragId.current);
    const to = ids.indexOf(overId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    reorderProducts(currentCat, ids);
    dragId.current = null;
  };

  return (
    <div className="min-h-screen aquish-bg text-xs tracking-widest">
      <header className="flex items-center justify-between px-4 h-12" style={{ borderBottom: "1px solid #000" }}>
        <div>AQUISH / ADMIN</div>
        <Link to="/" className="aquish-hover">← STOREFRONT</Link>
      </header>

      <div className="grid md:grid-cols-[260px_1fr]" style={{ minHeight: "calc(100vh - 48px)" }}>
        {/* Sidebar: categories */}
        <aside className="p-4 flex flex-col gap-3" style={{ borderRight: "1px solid #000" }}>
          <div>CATEGORIES</div>
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <button
                onClick={() => setActiveCat(c.id)}
                className={`aquish-hover flex-1 text-left ${currentCat === c.id ? "underline underline-offset-4" : ""}`}
              >
                {c.name}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete ${c.name}? All its products will be removed.`)) {
                    deleteCategory(c.id);
                    if (currentCat === c.id) setActiveCat(null);
                  }
                }}
                className="aquish-hover"
                title="Delete category"
              >
                ×
              </button>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newCat.trim()) return;
              addCategory(newCat.trim());
              setNewCat("");
            }}
            className="flex gap-1 mt-4 w-full min-w-0"
          >
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="NEW CATEGORY"
              className="flex-1 min-w-0 px-2 py-2 bg-transparent uppercase tracking-widest text-[10px]"
              style={{ border: "1px solid #000" }}
            />
            <button
              type="submit"
              className="aquish-hover px-2 py-2 text-[10px] tracking-widest shrink-0 whitespace-nowrap"
              style={{ background: "#000", color: "#fff", border: "none" }}
            >
              ADD
            </button>
          </form>

          <DropControl />
          
          <DiscountCodes />
          <AdminInviteCodes />
          <UIToggles />
          <BulkCSV />
          <SiteContentEditor />
        </aside>



        {/* Products + Orders */}
        <section className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div>PRODUCTS</div>
              {catProducts.length > 0 && (
                <label className="flex items-center gap-2 text-[10px] opacity-70">
                  <input
                    type="checkbox"
                    checked={catProducts.every((p) => selected.has(p.id))}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) catProducts.forEach((p) => next.add(p.id));
                      else catProducts.forEach((p) => next.delete(p.id));
                      setSelected(next);
                    }}
                  />
                  SELECT ALL
                </label>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {selected.size > 0 && (
                <>
                  <ExportMenu
                    label={`EXPORT (${selected.size})`}
                    options={[
                      { key: "csv", label: "DOWNLOAD CSV", onSelect: () => exportProductsCsv(products.filter((p) => selected.has(p.id)), categories) },
                      { key: "pdf", label: "DOWNLOAD PDF", onSelect: () => exportProductsPdf(products.filter((p) => selected.has(p.id)), categories) },
                    ]}
                  />
                  <button
                    onClick={() => {
                      if (confirm(`Delete ${selected.size} product(s)?`)) {
                        deleteProducts([...selected]);
                        setSelected(new Set());
                      }
                    }}
                    className="aquish-hover px-3 py-2"
                    style={{ background: "#000", color: "#fff", border: "none" }}
                  >
                    DELETE SELECTED ({selected.size})
                  </button>
                </>
              )}
              <button
                onClick={() =>
                  setEditing({
                    id: crypto.randomUUID(),
                    sku: "",
                    name: "",
                    price: "",
                    description: "",
                    categoryId: currentCat ?? "",
                    colors: [],
                    sizes: [],
                    stock: 0,
                    lowStockThreshold: 3,
                    status: "draft",
                    order: catProducts.length,
                    tags: [],
                    styles: [],
                  })
                }
                disabled={!currentCat}
                className="aquish-hover px-3 py-2 disabled:opacity-40"
                style={{ background: "#000", color: "#fff", border: "none" }}
              >
                + NEW PRODUCT
              </button>
            </div>
          </div>


          {catProducts.length === 0 && (
            <div className="opacity-60 py-10">NO PRODUCTS IN THIS CATEGORY</div>
          )}

          <div className="flex flex-col">
            {catProducts.map((p, idx) => (
              <div
                key={p.id}
                draggable
                onDragStart={() => onDragStart(p.id)}
                onDragOver={onDragOver}
                onDrop={() => onDrop(p.id)}
                className="flex items-center gap-3 p-2 aquish-hover"
                style={{ borderBottom: "1px solid #000", cursor: "move" }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleSel(p.id)}
                />
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={idx === 0}
                    onClick={() => {
                      if (!currentCat || idx === 0) return;
                      const ids = catProducts.map((x) => x.id);
                      [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
                      reorderProducts(currentCat, ids);
                    }}
                    className="aquish-hover leading-none disabled:opacity-30"
                    style={{ fontSize: 10, padding: "0 4px" }}
                  >▲</button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={idx === catProducts.length - 1}
                    onClick={() => {
                      if (!currentCat || idx === catProducts.length - 1) return;
                      const ids = catProducts.map((x) => x.id);
                      [ids[idx + 1], ids[idx]] = [ids[idx], ids[idx + 1]];
                      reorderProducts(currentCat, ids);
                    }}
                    className="aquish-hover leading-none disabled:opacity-30"
                    style={{ fontSize: 10, padding: "0 4px" }}
                  >▼</button>
                </div>
                <div style={{ width: 48, height: 48 }}>
                  {(() => {
                    const thumb = getColorImages(p.colors[0])[0];
                    return thumb ? (
                      <img src={thumb} className="w-full h-full object-contain" alt="" />
                    ) : (
                      <div className="w-full h-full" style={{ background: "#e5e3df" }} />
                    );
                  })()}
                </div>
                <div className="flex-1">
                  <div>{p.sku || "—"}</div>
                  <div className="opacity-60">{p.name}</div>
                </div>
                <div>{p.price || "—"}</div>
                <div>STOCK {p.stock}</div>
                <div>{p.status === "published" ? "PUBLISHED" : "DRAFT"}</div>
                <button onClick={() => setEditing(p)} className="aquish-hover ml-2">EDIT</button>
              </div>
            ))}
          </div>

          <SalesDashboard />
          <RevenueTrendsModal />
          <OrdersPanel />
          <RefundsPanel />
        </section>
      </div>


      {editing && (
        <ProductEditor
          initial={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSave={(p) => {
            upsertProduct(p);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ProductEditor({
  initial,
  categories,
  onClose,
  onSave,
}: {
  initial: Product;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSave: (p: Product) => void;
}) {
  const { content } = useSiteContent();
  const [p, setP] = useState<Product>(initial);
  const [sizesText, setSizesText] = useState(initial.sizes.join(", "));
  const [tagsText, setTagsText] = useState((initial.tags ?? []).join(", "));
  const [salePct, setSalePct] = useState<string>(() => {
    const v = getProductSale(content, initial.id);
    return v ? String(v) : "";
  });
  const [dropAtLocal, setDropAtLocal] = useState<string>(() =>
    toLocalInputValue(getProductDrop(content, initial.id)),
  );


  const resizeImage = (file: File, maxDim = 1200, quality = 0.85): Promise<string> =>
    new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return rej(new Error("Canvas not supported"));
          ctx.drawImage(img, 0, 0, width, height);
          // Preserve transparency for PNG / WebP / GIF uploads — encoding as
          // JPEG would flatten the alpha channel to black. We keep JPEG for
          // opaque photos (smaller files).
          const isTransparent = /png|webp|gif|svg/i.test(file.type);
          const dataUrl = isTransparent
            ? canvas.toDataURL("image/png")
            : canvas.toDataURL("image/jpeg", quality);
          res(dataUrl);
        };
        img.onerror = rej;
        img.src = reader.result as string;
      };
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

  const fileToDataUrl = (file: File): Promise<string> => resizeImage(file);

  const addColor = () => {
    const c: ColorVariant = {
      id: crypto.randomUUID(),
      name: "",
      swatch: "#000000",
      images: [],
    };
    setP({ ...p, colors: [...p.colors, c] });
  };

  const updateColor = (id: string, patch: Partial<ColorVariant>) =>
    setP({ ...p, colors: p.colors.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  const removeColor = (id: string) =>
    setP({ ...p, colors: p.colors.filter((c) => c.id !== id) });

  const addColorImages = async (id: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const dataUrls = await Promise.all(Array.from(files).map(fileToDataUrl));
    const color = p.colors.find((c) => c.id === id);
    const existing = getColorImages(color);
    updateColor(id, { images: [...existing, ...dataUrls], image: undefined });
  };

  const removeColorImage = (id: string, idx: number) => {
    const color = p.colors.find((c) => c.id === id);
    const existing = getColorImages(color);
    const next = existing.filter((_, i) => i !== idx);
    updateColor(id, { images: next, image: undefined });
  };

  // --- Styles: a style is a named grouping that holds its own colours.
  // Styles are optional; standalone colours still work above.
  const styles = p.styles ?? [];
  const addStyle = () =>
    setP({
      ...p,
      styles: [...styles, { id: crypto.randomUUID(), name: "", colors: [] }],
    });
  const updateStyle = (sid: string, patch: Partial<{ name: string; colors: ColorVariant[] }>) =>
    setP({
      ...p,
      styles: styles.map((s) => (s.id === sid ? { ...s, ...patch } : s)),
    });
  const removeStyle = (sid: string) =>
    setP({ ...p, styles: styles.filter((s) => s.id !== sid) });
  const addStyleColor = (sid: string) => {
    const s = styles.find((x) => x.id === sid);
    if (!s) return;
    const c: ColorVariant = { id: crypto.randomUUID(), name: "", swatch: "#000000", images: [] };
    updateStyle(sid, { colors: [...(s.colors ?? []), c] });
  };
  const updateStyleColor = (sid: string, cid: string, patch: Partial<ColorVariant>) => {
    const s = styles.find((x) => x.id === sid);
    if (!s) return;
    updateStyle(sid, {
      colors: s.colors.map((c) => (c.id === cid ? { ...c, ...patch } : c)),
    });
  };
  const removeStyleColor = (sid: string, cid: string) => {
    const s = styles.find((x) => x.id === sid);
    if (!s) return;
    updateStyle(sid, { colors: s.colors.filter((c) => c.id !== cid) });
  };
  const addStyleColorImages = async (sid: string, cid: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const dataUrls = await Promise.all(Array.from(files).map(fileToDataUrl));
    const s = styles.find((x) => x.id === sid);
    const color = s?.colors.find((c) => c.id === cid);
    const existing = getColorImages(color);
    updateStyleColor(sid, cid, { images: [...existing, ...dataUrls], image: undefined });
  };
  const removeStyleColorImage = (sid: string, cid: string, idx: number) => {
    const s = styles.find((x) => x.id === sid);
    const color = s?.colors.find((c) => c.id === cid);
    const existing = getColorImages(color);
    updateStyleColor(sid, cid, {
      images: existing.filter((_, i) => i !== idx),
      image: undefined,
    });
  };

  /** Render a colour row — reused for both standalone colours and style colours. */
  const renderColorRow = (
    c: ColorVariant,
    handlers: {
      onChange: (patch: Partial<ColorVariant>) => void;
      onRemove: () => void;
      onAddImages: (files: FileList | null) => Promise<void>;
      onRemoveImage: (idx: number) => void;
    },
  ) => (
    <div key={c.id} className="flex flex-col gap-2 p-3" style={{ border: "1px solid #000" }}>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={c.swatch}
          onChange={(e) => handlers.onChange({ swatch: e.target.value })}
          style={{ width: 36, height: 36, border: "1px solid #000", background: "transparent" }}
        />
        <input
          value={c.name}
          onChange={(e) => handlers.onChange({ name: e.target.value.toUpperCase() })}
          placeholder="COLOUR NAME"
          className="ai flex-1"
        />
        <button onClick={handlers.onRemove} className="aquish-hover">×</button>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {getColorImages(c).map((src, i) => (
            <div key={i} className="relative" style={{ width: 60, height: 60, border: "1px solid #000" }}>
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              <button
                type="button"
                onClick={() => handlers.onRemoveImage(i)}
                aria-label="Remove image"
                className="absolute -top-2 -right-2 aquish-hover"
                style={{
                  width: 18, height: 18, background: "#000", color: "#fff",
                  fontSize: 12, lineHeight: "16px", textAlign: "center", borderRadius: "50%",
                }}
              >×</button>
            </div>
          ))}
          {getColorImages(c).length === 0 && (
            <div style={{ width: 60, height: 60, background: "#e5e3df" }} />
          )}
        </div>
        <label className="inline-flex">
          <span className="aquish-hover px-2 py-1" style={{ border: "1px solid #000", cursor: "pointer" }}>
            + UPLOAD IMAGES
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              await handlers.onAddImages(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 aquish-bg aquish-fade-in overflow-auto">
      <div className="max-w-2xl mx-auto p-6 flex flex-col gap-4 text-xs tracking-widest">
        <div className="flex items-center justify-between">
          <div>PRODUCT</div>
          <button onClick={onClose} className="aquish-hover">×</button>
        </div>

        <Field label="SKU">
          <input
            value={p.sku}
            onChange={(e) => setP({ ...p, sku: e.target.value.toUpperCase() })}
            className="ai"
          />
        </Field>
        <Field label="NAME">
          <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value.toUpperCase() })} className="ai" />
        </Field>
        <Field label="PRICE (E.G. R499, $30.31, €120)">
          <input
            value={p.price}
            onChange={(e) => setP({ ...p, price: e.target.value })}
            placeholder="R499"
            className="ai"
          />
        </Field>
        <Field label="DESCRIPTION (ONE DETAIL PER LINE — E.G. MATERIALS, FIT)">
          <textarea
            value={p.description}
            onChange={(e) => setP({ ...p, description: e.target.value.toUpperCase() })}
            placeholder={"SET IN SLEEVE\n100% COTTON"}
            rows={4}
            className="ai"
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>
        <Field label="TAGS (COMMA SEPARATED — USED FOR SEARCH, NOT SHOWN)">
          <textarea
            value={tagsText}
            onChange={(e) => {
              const v = e.target.value;
              setTagsText(v);
              setP({
                ...p,
                tags: v
                  .split(",")
                  .map((t) => t.trim().toLowerCase())
                  .filter(Boolean),
              });
            }}
            placeholder="kanye west, black, men, tshirt, oversized, cool"
            rows={2}
            className="ai"
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>
        <Field label="CATEGORY">
          <select
            value={p.categoryId}
            onChange={(e) => setP({ ...p, categoryId: e.target.value })}
            className="ai"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="SIZES (COMMA SEPARATED)">
          <input
            value={sizesText}
            onChange={(e) => {
              setSizesText(e.target.value);
              setP({
                ...p,
                sizes: e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
              });
            }}
            className="ai"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="STOCK">
            <input type="number" value={p.stock} onChange={(e) => setP({ ...p, stock: parseInt(e.target.value) || 0 })} className="ai" />
          </Field>
          <Field label="LOW STOCK THRESHOLD">
            <input type="number" value={p.lowStockThreshold} onChange={(e) => setP({ ...p, lowStockThreshold: parseInt(e.target.value) || 0 })} className="ai" />
          </Field>
        </div>
        <Field label="STATUS">
          <div className="flex gap-2">
            {(["draft", "published"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setP({ ...p, status: s })}
                className="aquish-hover px-3 py-2"
                style={{
                  border: "1px solid #000",
                  background: p.status === s ? "#000" : "transparent",
                  color: p.status === s ? "#fff" : "#000",
                }}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex flex-col gap-3 mt-2">
          <div className="flex items-center justify-between">
            <div>COLOURS</div>
            <div className="flex gap-2">
              <button onClick={addColor} className="aquish-hover px-2 py-1" style={{ border: "1px solid #000" }}>+ ADD COLOUR</button>
              <button onClick={addStyle} className="aquish-hover px-2 py-1" style={{ border: "1px solid #000" }}>+ ADD STYLE</button>
            </div>
          </div>
          {p.colors.map((c) =>
            renderColorRow(c, {
              onChange: (patch) => updateColor(c.id, patch),
              onRemove: () => removeColor(c.id),
              onAddImages: (files) => addColorImages(c.id, files),
              onRemoveImage: (i) => removeColorImage(c.id, i),
            }),
          )}
          {styles.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-2 p-3"
              style={{ border: "1px dashed #000", background: "rgba(0,0,0,0.02)" }}
            >
              <div className="flex items-center gap-2">
                <div className="opacity-70">STYLE</div>
                <input
                  value={s.name}
                  onChange={(e) => updateStyle(s.id, { name: e.target.value.toUpperCase() })}
                  placeholder="STYLE NAME (E.G. OVERSIZED)"
                  className="ai flex-1"
                />
                <button
                  onClick={() => addStyleColor(s.id)}
                  className="aquish-hover px-2 py-1"
                  style={{ border: "1px solid #000" }}
                >+ COLOUR</button>
                <button onClick={() => removeStyle(s.id)} className="aquish-hover">×</button>
              </div>
              <div className="flex flex-col gap-2">
                {(s.colors ?? []).map((c) =>
                  renderColorRow(c, {
                    onChange: (patch) => updateStyleColor(s.id, c.id, patch),
                    onRemove: () => removeStyleColor(s.id, c.id),
                    onAddImages: (files) => addStyleColorImages(s.id, c.id, files),
                    onRemoveImage: (i) => removeStyleColorImage(s.id, c.id, i),
                  }),
                )}
                {(s.colors ?? []).length === 0 && (
                  <div className="opacity-60 text-[10px]">NO COLOURS IN THIS STYLE YET</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-2">
          <Field label="SALE % OFF (0 = NONE)">
            <input
              type="number"
              min={0}
              max={99}
              value={salePct}
              onChange={(e) => setSalePct(e.target.value)}
              placeholder="0"
              className="ai"
            />
          </Field>
          <Field label={`DROP AT (YOUR TIMEZONE: ${Intl.DateTimeFormat().resolvedOptions().timeZone} — BLANK = NONE)`}>
            <input
              type="datetime-local"
              value={dropAtLocal}
              onChange={(e) => setDropAtLocal(e.target.value)}
              className="ai"
            />
          </Field>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="aquish-hover px-3 py-2 flex-1" style={{ border: "1px solid #000" }}>CANCEL</button>
          <button
            onClick={async () => {
              const pct = Math.max(0, Math.min(99, parseInt(salePct, 10) || 0));
              await saveContent(productSaleKey(p.id), pct > 0 ? String(pct) : "");
              await saveContent(productDropKey(p.id), fromLocalInputValue(dropAtLocal));
              onSave(p);
            }}
            className="aquish-hover px-3 py-2 flex-1"
            style={{ background: "#000", color: "#fff", border: "none" }}
          >
            SAVE
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span>{label}</span>
      {children}
    </label>
  );
}

function DropControl() {
  const dropAt = useStore((s) => s.dropAt);
  const [val, setVal] = useState(() => toLocalInputValue(dropAt));
  useEffect(() => { setVal(toLocalInputValue(dropAt)); }, [dropAt]);
  return (
    <div className="flex flex-col gap-2 mt-6 pt-4" style={{ borderTop: "1px solid #000" }}>
      <div>NEXT DROP</div>
      <input
        type="datetime-local"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="ai"
      />
      <div className="flex gap-2">
        <button
          onClick={() => setDropAt(fromLocalInputValue(val) || null)}
          className="aquish-hover px-3 py-2 flex-1"
          style={{ background: "#000", color: "#fff", border: "none" }}
        >
          SAVE
        </button>
        <button
          onClick={() => { setVal(""); setDropAt(null); }}
          className="aquish-hover px-3 py-2"
          style={{ border: "1px solid #000" }}
        >
          CLEAR
        </button>
      </div>
    </div>
  );
}

type DiscountRow = {
  id: string;
  code: string;
  percent_off: number | null;
  amount_off: number | null;
  active: boolean;
  used_count: number;
  max_uses: number | null;
  expires_at: string | null;
};

function DiscountCodes() {
  const [rows, setRows] = useState<DiscountRow[]>([]);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const [amount, setAmount] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("discount_codes")
      .select("id, code, percent_off, amount_off, active, used_count, max_uses, expires_at")
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else setRows((data as DiscountRow[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const p = parseFloat(percent);
    const a = parseFloat(amount);
    if ((!p || isNaN(p)) && (!a || isNaN(a))) {
      setErr("ENTER PERCENT OR AMOUNT");
      return;
    }
    const { error } = await supabase.from("discount_codes").insert({
      code: code.trim().toUpperCase(),
      percent_off: p && !isNaN(p) ? p : null,
      amount_off: a && !isNaN(a) ? a : null,
      max_uses: maxUses ? parseInt(maxUses) : null,
      currency: "GBP",
    });
    if (error) return setErr(error.message);
    setCode(""); setPercent(""); setAmount(""); setMaxUses("");
    load();
  };

  const toggle = async (r: DiscountRow) => {
    await supabase.from("discount_codes").update({ active: !r.active }).eq("id", r.id);
    load();
  };
  const remove = async (r: DiscountRow) => {
    if (!confirm(`Delete ${r.code}?`)) return;
    await supabase.from("discount_codes").delete().eq("id", r.id);
    load();
  };

  return (
    <div className="flex flex-col gap-2 mt-6 pt-4" style={{ borderTop: "1px solid #000" }}>
      <div>DISCOUNT CODES</div>
      <form onSubmit={create} className="flex flex-col gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" className="ai" maxLength={64} required />
        <div className="grid grid-cols-2 gap-2">
          <input value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="% OFF" className="ai" type="number" min="0" max="100" step="0.1" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="£ OFF" className="ai" type="number" min="0" step="0.01" />
        </div>
        <input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="MAX USES (OPTIONAL)" className="ai" type="number" min="1" />
        <button type="submit" className="aquish-hover px-3 py-2" style={{ background: "#000", color: "#fff", border: "none" }}>ADD CODE</button>
        {err && <div className="opacity-70">{err.toUpperCase()}</div>}
      </form>
      <div className="flex flex-col gap-1 mt-2">
        {rows.length === 0 && <div className="opacity-60">NO CODES</div>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 py-1" style={{ borderBottom: "1px solid #000" }}>
            <div className="flex-1">
              <div>{r.code}{!r.active && " (OFF)"}</div>
              <div className="opacity-60 text-[10px]">
                {r.percent_off ? `${r.percent_off}% OFF` : `£${r.amount_off} OFF`} · USED {r.used_count}{r.max_uses ? `/${r.max_uses}` : ""}
              </div>
            </div>
            <button onClick={() => toggle(r)} className="aquish-hover">{r.active ? "PAUSE" : "RESUME"}</button>
            <button onClick={() => remove(r)} className="aquish-hover">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SiteContentEditor() {
  const { content, refresh } = useSiteContent();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const valueFor = (k: string) => (k in drafts ? drafts[k] : (content[k] ?? ""));
  const setDraft = (k: string, v: string) => setDrafts((d) => ({ ...d, [k]: v }));

  const save = async (k: string) => {
    setSavingKey(k);
    const { error } = await saveContent(k, valueFor(k));
    setSavingKey(null);
    if (!error) {
      setSavedKey(k);
      setTimeout(() => setSavedKey((s) => (s === k ? null : s)), 1200);
      await refresh();
      setDrafts((d) => {
        const { [k]: _, ...rest } = d;
        return rest;
      });
    } else {
      alert(error.message);
    }
  };

  return (
    <div className="mt-6 pt-4" style={{ borderTop: "1px solid #000" }}>
      <button onClick={() => setOpen((o) => !o)} className="aquish-hover w-full text-left">
        SITE CONTENT {open ? "−" : "+"}
      </button>
      {open && (
        <div className="flex flex-col gap-3 mt-3">
          {CONTENT_FIELDS.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <div className="opacity-60 text-[10px]">{f.label}</div>
              {f.multiline ? (
                <textarea
                  value={valueFor(f.key)}
                  onChange={(e) => setDraft(f.key, e.target.value)}
                  rows={4}
                  className="px-2 py-2 bg-transparent text-xs"
                  style={{ border: "1px solid #000" }}
                />
              ) : (
                <input
                  value={valueFor(f.key)}
                  onChange={(e) => setDraft(f.key, e.target.value)}
                  className="px-2 py-2 bg-transparent text-xs"
                  style={{ border: "1px solid #000" }}
                />
              )}
              <button
                onClick={() => save(f.key)}
                disabled={savingKey === f.key}
                className="aquish-hover self-end px-2 py-1 text-[10px]"
                style={{ background: "#000", color: "#fff", border: "none" }}
              >
                {savingKey === f.key ? "SAVING…" : savedKey === f.key ? "SAVED" : "SAVE"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UIToggles() {
  const { content, refresh } = useSiteContent();
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (key: string) => {
    setBusy(key);
    const next = content[key] === "0" ? "1" : "0";
    await saveContent(key, next);
    await refresh();
    setBusy(null);
  };
  const resetAll = async () => {
    setBusy("__reset");
    await Promise.all(UI_TOGGLES.map((t) => saveContent(t.key, "1")));
    await refresh();
    setBusy(null);
  };
  return (
    <div className="mt-6 pt-4 flex flex-col gap-2" style={{ borderTop: "1px solid #000" }}>
      <div className="flex items-center justify-between">
        <span>FOOTER LINKS</span>
        <button
          onClick={resetAll}
          disabled={busy === "__reset"}
          className="aquish-hover px-2 py-1 text-[10px] tracking-widest"
          style={{ border: "1px solid #000" }}
        >
          {busy === "__reset" ? "RESETTING…" : "RESET ALL"}
        </button>
      </div>
      {UI_TOGGLES.map((t) => {
        const on = content[t.key] !== "0";
        return (
          <button
            key={t.key}
            onClick={() => toggle(t.key)}
            disabled={busy === t.key}
            className="aquish-hover flex items-center justify-between px-2 py-2"
            style={{ border: "1px solid #000" }}
          >
            <span>{t.label}</span>
            <span style={{ background: on ? "#000" : "transparent", color: on ? "#fff" : "#000", padding: "1px 6px", border: "1px solid #000" }}>
              {on ? "ON" : "OFF"}
            </span>
          </button>
        );
      })}
    </div>
  );
}


type AdminInviteRow = {
  id: string;
  code: string;
  note: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  active: boolean;
};

function AdminInviteCodes() {
  const [rows, setRows] = useState<AdminInviteRow[]>([]);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState("24");
  const [maxUses, setMaxUses] = useState("1");
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("admin_invite_codes")
      .select("id, code, note, expires_at, max_uses, used_count, active")
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else setRows((data as AdminInviteRow[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const gen = () => {
    const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)];
    setCode(s);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const h = parseFloat(hours);
    const expires = h && !isNaN(h) ? new Date(Date.now() + h * 3600_000).toISOString() : null;
    const { error } = await supabase.from("admin_invite_codes").insert({
      code: code.trim().toUpperCase(),
      note: note.trim(),
      expires_at: expires,
      max_uses: maxUses ? parseInt(maxUses) : null,
    });
    if (error) return setErr(error.message);
    setCode(""); setNote(""); setHours("24"); setMaxUses("1");
    load();
  };

  const toggle = async (r: AdminInviteRow) => {
    await supabase.from("admin_invite_codes").update({ active: !r.active }).eq("id", r.id);
    load();
  };
  const remove = async (r: AdminInviteRow) => {
    if (!confirm(`Delete ${r.code}?`)) return;
    await supabase.from("admin_invite_codes").delete().eq("id", r.id);
    load();
  };

  return (
    <div className="flex flex-col gap-2 mt-6 pt-4" style={{ borderTop: "1px solid #000" }}>
      <div>ADMIN INVITE CODES</div>
      <div className="opacity-60 text-[10px]">SHARE WITH DEV/SUPPORT. EXPIRES + USAGE CAP ENFORCED.</div>
      <form onSubmit={create} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" className="ai flex-1" maxLength={64} required />
          <button type="button" onClick={gen} className="aquish-hover px-2" style={{ border: "1px solid #000" }}>GEN</button>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="NOTE (E.G. SUPPORT — JOHN)" className="ai" />
        <div className="grid grid-cols-2 gap-2">
          <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="EXPIRES IN HOURS" className="ai" type="number" min="0" step="0.5" />
          <input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="MAX USES" className="ai" type="number" min="1" />
        </div>
        <button type="submit" className="aquish-hover px-3 py-2" style={{ background: "#000", color: "#fff", border: "none" }}>ADD CODE</button>
        {err && <div className="opacity-70">{err.toUpperCase()}</div>}
      </form>
      <div className="flex flex-col gap-1 mt-2">
        {rows.length === 0 && <div className="opacity-60">NO CODES</div>}
        {rows.map((r) => {
          const expired = r.expires_at && new Date(r.expires_at).getTime() < Date.now();
          return (
            <div key={r.id} className="flex items-center gap-2 py-1" style={{ borderBottom: "1px solid #000" }}>
              <div className="flex-1">
                <div>{r.code}{!r.active && " (OFF)"}{expired && " (EXPIRED)"}</div>
                <div className="opacity-60 text-[10px]">
                  {r.note || "—"} · USED {r.used_count}{r.max_uses ? `/${r.max_uses}` : ""}
                  {r.expires_at ? ` · EXP ${new Date(r.expires_at).toLocaleString()}` : ""}
                </div>
              </div>
              <button onClick={() => toggle(r)} className="aquish-hover">{r.active ? "PAUSE" : "RESUME"}</button>
              <button onClick={() => remove(r)} className="aquish-hover">×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type OrderRow = {
  id: string;
  email: string;
  items: Array<{ sku: string; name: string; color: string; size: string; qty: number; unitPriceGbp: number }>;
  subtotal: number;
  discount_code: string | null;
  discount_amount: number;
  total: number;
  currency: string;
  status: string;
  shipping_address: Record<string, string>;
  created_at: string;
};

function OrdersPanel() {
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const products = useStore((s) => s.products);
  const deleteOrder = useServerFn(adminDeleteOrder);
  const createManual = useServerFn(adminCreateManualOrder);
  const updateOrderStatus = useServerFn(adminUpdateOrderStatus);

  const toggleOrderSel = (id: string) => {
    const next = new Set(selectedOrders);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedOrders(next);
  };

  const enrich = (o: OrderRow): InvoiceOrder => ({
    ...o,
    items: (o.items ?? []).map((it) => {
      const p = products.find((pp) => pp.sku === it.sku);
      const img = getColorImages(p?.colors?.find((c) => c.name === it.color))[0] ?? getColorImages(p?.colors?.[0])[0] ?? null;
      return { ...it, image: img } as any;
    }),
  });

  const exportOrdersCsv = (list: OrderRow[]) => {
    const headers = ["id", "created_at", "email", "status", "currency", "subtotal", "discount_code", "discount_amount", "total", "items", "ship_name", "ship_address", "ship_city", "ship_region", "ship_postal", "ship_country", "ship_phone"];
    const lines = [headers.join(",")];
    for (const o of list) {
      const a = o.shipping_address || {};
      const itemStr = o.items.map((it) => `${it.sku}:${it.color || "-"}:${it.size || "-"}x${it.qty}@${it.unitPriceGbp}`).join(" | ");
      lines.push([
        o.id, o.created_at, o.email, o.status, o.currency, o.subtotal,
        o.discount_code ?? "", o.discount_amount, o.total, itemStr,
        `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim(), `${a.address ?? ""} ${a.apt ?? ""}`.trim(),
        a.city ?? "", a.region ?? "", a.postal ?? "", a.country ?? "", a.phone ?? "",
      ].map(csvEscape).join(","));
    }
    downloadBlob(lines.join("\n"), `aquish-orders-${new Date().toISOString().slice(0, 10)}.csv`);
  };




  const load = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("id, email, items, subtotal, discount_code, discount_amount, total, currency, status, shipping_address, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) setErr(error.message);
    else setRows((data as unknown as OrderRow[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await updateOrderStatus({ data: { id, status: status as any, notify: true } });
    } catch (e: any) {
      setErr(e?.message ?? "STATUS UPDATE FAILED");
    }
    load();
  };

  const removeOrder = async (id: string) => {
    if (!confirm("DELETE THIS ORDER? THIS CANNOT BE UNDONE.")) return;
    try {
      await deleteOrder({ data: { id } });
      load();
    } catch (e: any) {
      setErr(e?.message ?? "DELETE FAILED");
    }
  };

  // Manual order form
  const [mOpen, setMOpen] = useState(false);
  const [mEmail, setMEmail] = useState("");
  const [mTotal, setMTotal] = useState("");
  const [mCurrency, setMCurrency] = useState("GBP");
  const [mStatus, setMStatus] = useState<"pending" | "paid" | "shipped" | "delivered" | "cancelled">("paid");
  const [mNote, setMNote] = useState("");
  const [mBusy, setMBusy] = useState(false);

  const submitManual = async () => {
    setErr(null);
    const total = parseFloat(mTotal);
    if (!mEmail || !isFinite(total)) { setErr("EMAIL AND TOTAL REQUIRED"); return; }
    setMBusy(true);
    try {
      await createManual({ data: { email: mEmail, total, currency: mCurrency, status: mStatus, note: mNote } });
      setMEmail(""); setMTotal(""); setMNote(""); setMOpen(false);
      load();
    } catch (e: any) {
      setErr(e?.message ?? "CREATE FAILED");
    } finally {
      setMBusy(false);
    }
  };


  return (
    <div className="mt-10 pt-6" style={{ borderTop: "1px solid #000" }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div>ORDERS ({rows?.length ?? "…"})</div>
          {rows && rows.length > 0 && (
            <label className="flex items-center gap-2 text-[10px] opacity-70">
              <input
                type="checkbox"
                checked={rows.length > 0 && rows.every((r) => selectedOrders.has(r.id))}
                onChange={(e) => {
                  if (e.target.checked) setSelectedOrders(new Set(rows.map((r) => r.id)));
                  else setSelectedOrders(new Set());
                }}
              />
              SELECT ALL
            </label>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedOrders.size > 0 && rows && (
            <ExportMenu
              size="sm"
              label={`EXPORT (${selectedOrders.size})`}
              options={[
                { key: "csv", label: "DOWNLOAD CSV", onSelect: () => exportOrdersCsv(rows.filter((r) => selectedOrders.has(r.id))) },
                { key: "pdf", label: "DOWNLOAD PDF", onSelect: () => exportOrdersPdf(rows.filter((r) => selectedOrders.has(r.id)).map(enrich)) },
                { key: "inv", label: "INVOICES PDF", onSelect: () => downloadInvoicesBulk(rows.filter((r) => selectedOrders.has(r.id)).map(enrich)) },
              ]}
            />
          )}
          {rows && rows.length > 0 && (
            <ExportMenu
              size="sm"
              label="EXPORT ALL"
              options={[
                { key: "csv", label: "DOWNLOAD CSV", onSelect: () => exportOrdersCsv(rows) },
                { key: "pdf", label: "DOWNLOAD PDF", onSelect: () => exportOrdersPdf(rows.map(enrich)) },
              ]}
            />
          )}
          <button onClick={() => setMOpen((v) => !v)} className="aquish-hover">
            {mOpen ? "CLOSE" : "+ MANUAL ORDER"}
          </button>
          <button onClick={load} className="aquish-hover">REFRESH</button>
        </div>
      </div>
      {mOpen && (
        <div className="mb-4 p-3 flex flex-col gap-2" style={{ border: "1px solid #000" }}>
          <div className="opacity-60 text-[10px]">MANUAL ORDER / REVENUE ADJUSTMENT (USE NEGATIVE TOTAL TO SUBTRACT)</div>
          <div className="grid md:grid-cols-2 gap-2">
            <input placeholder="EMAIL" value={mEmail} onChange={(e) => setMEmail(e.target.value)} className="p-2" style={{ border: "1px solid #000" }} />
            <input placeholder="TOTAL (e.g. 99.00)" value={mTotal} onChange={(e) => setMTotal(e.target.value)} className="p-2" style={{ border: "1px solid #000" }} />
            <input placeholder="CURRENCY" value={mCurrency} onChange={(e) => setMCurrency(e.target.value.toUpperCase())} className="p-2" style={{ border: "1px solid #000" }} />
            <select value={mStatus} onChange={(e) => setMStatus(e.target.value as typeof mStatus)} className="p-2" style={{ border: "1px solid #000" }}>
              {["pending", "paid", "processing", "shipped", "delivered", "cancelled"].map((s) => (
                <option key={s} value={s}>{s.toUpperCase()}</option>
              ))}
            </select>
            <input placeholder="NOTE (optional)" value={mNote} onChange={(e) => setMNote(e.target.value)} className="p-2 md:col-span-2" style={{ border: "1px solid #000" }} />
          </div>
          <button onClick={submitManual} disabled={mBusy} className="aquish-hover p-2 self-start" style={{ border: "1px solid #000" }}>
            {mBusy ? "SAVING…" : "CREATE ORDER"}
          </button>
        </div>
      )}
      {err && <div className="opacity-70 mb-2">{err.toUpperCase()}</div>}
      {rows && rows.length === 0 && <div className="opacity-60 py-6">NO ORDERS YET</div>}

      <div className="flex flex-col">
        {rows?.map((o) => {
          const open = openId === o.id;
          return (
            <div key={o.id} style={{ borderBottom: "1px solid #000" }}>
              <div className="flex items-center gap-3 p-2 aquish-hover">
                <input
                  type="checkbox"
                  checked={selectedOrders.has(o.id)}
                  onChange={() => toggleOrderSel(o.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={() => setOpenId(open ? null : o.id)}
                  className="flex items-center gap-3 flex-1 text-left"
                >
                  <div className="flex-1">
                    <div>{o.email}</div>
                    <div className="opacity-60 text-[10px]">
                      {new Date(o.created_at).toLocaleString()} · {o.items.length} ITEM(S)
                    </div>
                  </div>
                  <div>{o.currency} {o.total.toFixed(2)}</div>
                  <div className="px-2 py-1" style={{ border: "1px solid #000" }}>{o.status.toUpperCase()}</div>
                </button>
              </div>

              {open && (
                <div className="p-3 grid md:grid-cols-2 gap-4" style={{ background: "rgba(0,0,0,0.03)" }}>
                  <div className="flex flex-col gap-1">
                    <div className="opacity-60">ITEMS</div>
                    {o.items.map((it, i) => (
                      <div key={i} className="flex justify-between gap-2">
                        <div>{it.sku} · {it.name} · {it.color || "—"} · {it.size || "—"} × {it.qty}</div>
                        <div>£{(it.unitPriceGbp * it.qty).toFixed(2)}</div>
                      </div>
                    ))}
                    <div className="opacity-60 mt-2">TOTALS</div>
                    <div className="flex justify-between"><span>SUBTOTAL</span><span>£{o.subtotal.toFixed(2)}</span></div>
                    {o.discount_code && (
                      <div className="flex justify-between"><span>{o.discount_code}</span><span>−£{o.discount_amount.toFixed(2)}</span></div>
                    )}
                    <div className="flex justify-between"><span>TOTAL</span><span>{o.currency} {o.total.toFixed(2)}</span></div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="opacity-60">SHIPPING</div>
                    <div>{o.shipping_address.firstName} {o.shipping_address.lastName}</div>
                    <div>{o.shipping_address.address} {o.shipping_address.apt}</div>
                    <div>{o.shipping_address.city}, {o.shipping_address.region} {o.shipping_address.postal}</div>
                    <div>{o.shipping_address.country}</div>
                    {o.shipping_address.phone && <div>{o.shipping_address.phone}</div>}
                    <div className="opacity-60 mt-2">STATUS</div>
                    <div className="flex gap-2 flex-wrap">
                      {["pending", "paid", "processing", "shipped", "delivered", "cancelled"].map((s) => (
                        <button
                          key={s}
                          onClick={() => updateStatus(o.id, s)}
                          className="aquish-hover px-2 py-1 text-[10px]"
                          style={{
                            border: "1px solid #000",
                            background: o.status === s ? "#000" : "transparent",
                            color: o.status === s ? "#fff" : "#000",
                          }}
                        >
                          {s.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <OrderFulfillment orderId={o.id} />
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button
                        onClick={() => downloadInvoicePdf(enrich(o))}
                        className="aquish-hover px-2 py-1 text-[10px]"
                        style={{ border: "1px solid #000" }}
                      >
                        DOWNLOAD INVOICE
                      </button>
                      <button
                        onClick={() => removeOrder(o.id)}
                        className="aquish-hover px-2 py-1 text-[10px]"
                        style={{ border: "1px solid #000", color: "#900" }}
                      >
                        DELETE ORDER
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}

const csvEscape = (v: unknown) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadBlob(content: string, filename: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportProductsCsv(
  products: Product[],
  categories: { id: string; name: string }[],
) {
  const headers = ["id", "sku", "name", "price", "categoryId", "categoryName", "stock", "lowStockThreshold", "status", "order", "sizes", "description"];
  const rows = [headers.join(",")];
  for (const p of products) {
    const cat = categories.find((c) => c.id === p.categoryId);
    rows.push([
      p.id, p.sku, p.name, p.price, p.categoryId, cat?.name ?? "", p.stock, p.lowStockThreshold,
      p.status, p.order, p.sizes.join("|"), p.description.replace(/\n/g, "\\n"),
    ].map(csvEscape).join(","));
  }
  downloadBlob(rows.join("\n"), `aquish-products-${new Date().toISOString().slice(0, 10)}.csv`);
}

// --- Bulk CSV import/export for products ---
function BulkCSV() {
  const products = useStore((s) => s.products);
  const categoriesRaw = useStore((s) => s.categories);
  const { content } = useSiteContent();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const exportCsv = () => exportProductsCsv(products, categoriesRaw);

  const exportSitePages = () => {
    const sections: { key: string; label: string }[] = [
      { key: "shipping_body", label: "SHIPPING" },
      { key: "about_body", label: "ABOUT" },
      { key: "terms_body", label: "TERMS OF SERVICE" },
      { key: "privacy_body", label: "PRIVACY POLICY" },
      { key: "contact_general", label: "CONTACT — GENERAL" },
      { key: "contact_orders", label: "CONTACT — ORDERS" },
      { key: "contact_press", label: "CONTACT — PRESS" },
    ];
    const out = sections
      .map((s) => `# ${s.label}\n\n${(content[s.key] ?? "").trim()}\n`)
      .join("\n---\n\n");
    downloadBlob(out, `aquish-site-pages-${new Date().toISOString().slice(0, 10)}.txt`, "text/plain");
  };



  const parseCsv = (text: string): string[][] => {
    const rows: string[][] = [];
    let cur: string[] = [];
    let cell = "";
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cell += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { cur.push(cell); cell = ""; }
        else if (ch === "\n") { cur.push(cell); rows.push(cur); cur = []; cell = ""; }
        else if (ch === "\r") { /* skip */ }
        else cell += ch;
      }
    }
    if (cell.length || cur.length) { cur.push(cell); rows.push(cur); }
    return rows.filter((r) => r.some((c) => c.length));
  };

  const importCsv = async (file: File) => {
    setBusy(true); setMsg(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) { setMsg("EMPTY CSV"); return; }
      const headers = rows[0].map((h) => h.trim());
      const idx = (k: string) => headers.indexOf(k);
      let n = 0;
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const get = (k: string) => (idx(k) >= 0 ? row[idx(k)] ?? "" : "");
        const id = get("id") || crypto.randomUUID();
        const sku = get("sku").trim();
        if (!sku) continue;
        let categoryId = get("categoryId").trim();
        const catName = get("categoryName").trim().toUpperCase();
        if (!categoryId && catName) {
          const found = categoriesRaw.find((c) => c.name === catName);
          categoryId = found?.id ?? "";
        }
        const existing = products.find((p) => p.id === id || p.sku === sku);
        const product: Product = {
          id: existing?.id ?? id,
          sku,
          name: get("name") || existing?.name || "",
          price: get("price") || existing?.price || "",
          description: (get("description") || existing?.description || "").replace(/\\n/g, "\n"),
          categoryId: categoryId || existing?.categoryId || "",
          colors: existing?.colors ?? [],
          sizes: (get("sizes") || existing?.sizes.join("|") || "")
            .split("|").map((s) => s.trim()).filter(Boolean),
          stock: parseInt(get("stock") || "0", 10) || 0,
          lowStockThreshold: parseInt(get("lowStockThreshold") || "3", 10) || 3,
          status: (get("status") === "published" ? "published" : "draft"),
          order: parseInt(get("order") || "0", 10) || 0,
          tags: existing?.tags ?? [],
          styles: existing?.styles ?? [],
        };
        await upsertProduct(product);
        n++;
      }
      setMsg(`IMPORTED ${n}`);
    } catch (e: any) {
      setMsg(e?.message?.toUpperCase() ?? "IMPORT FAILED");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-6 pt-4" style={{ borderTop: "1px solid #000" }}>
      <div>BULK EXPORTS</div>
      <ExportMenu
        label={`EXPORT ALL PRODUCTS (${products.length})`}
        options={[
          { key: "csv", label: "DOWNLOAD CSV", onSelect: exportCsv },
          { key: "pdf", label: "DOWNLOAD PDF", onSelect: () => exportProductsPdf(products, categoriesRaw) },
        ]}
      />
      <button onClick={exportSitePages} className="aquish-hover px-3 py-2" style={{ border: "1px solid #000" }}>
        EXPORT SITE PAGES (SHIPPING, ABOUT, CONTACT, TERMS, PRIVACY)
      </button>

      <label className="aquish-hover px-3 py-2 text-center cursor-pointer" style={{ background: "#000", color: "#fff" }}>
        {busy ? "IMPORTING…" : "IMPORT CSV"}
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importCsv(f);
            e.target.value = "";
          }}
        />
      </label>
      {msg && <div className="opacity-70 text-[10px]">{msg}</div>}
      <div className="opacity-60 text-[10px]">
        Columns: id, sku, name, price, categoryId, categoryName, stock, lowStockThreshold, status, order, sizes (|-sep), description.
        Images / colours are preserved on existing rows and must be edited per-product.
      </div>
    </div>
  );
}

// --- Sales dashboard ---
type SalesOrder = { total: number; currency: string; status: string; created_at: string; items: Array<{ sku: string; qty: number; unitPriceGbp: number }> };

function SalesDashboard() {
  const [orders, setOrders] = useState<SalesOrder[] | null>(null);
  const listRefunds = useServerFn(adminListRefunds);
  const [refunds, setRefunds] = useState<RefundRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("total, currency, status, created_at, items")
        .order("created_at", { ascending: false })
        .limit(500);
      setOrders((data as unknown as SalesOrder[]) ?? []);
      try {
        const r = await listRefunds();
        setRefunds(r as RefundRow[]);
      } catch {
        setRefunds([]);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const list = (orders ?? []).filter((o) => o.status !== "cancelled");
    const now = Date.now();
    const last30 = list.filter((o) => now - new Date(o.created_at).getTime() < 30 * 86400000);
    const revenue30 = last30.reduce((s, o) => s + (o.total || 0), 0);
    const revenueAll = list.reduce((s, o) => s + (o.total || 0), 0);
    const currency = list[0]?.currency ?? "";

    const refundList = refunds ?? [];
    const refunds30 = refundList
      .filter((r) => now - new Date(r.createdAt).getTime() < 30 * 86400000)
      .reduce((s, r) => s + (r.amount || 0), 0);
    const refundsAll = refundList.reduce((s, r) => s + (r.amount || 0), 0);

    const skuMap = new Map<string, { qty: number; revenue: number }>();
    for (const o of list) for (const it of o.items ?? []) {
      const cur = skuMap.get(it.sku) ?? { qty: 0, revenue: 0 };
      cur.qty += it.qty || 0;
      cur.revenue += (it.qty || 0) * (it.unitPriceGbp || 0);
      skuMap.set(it.sku, cur);
    }
    const topSku = [...skuMap.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
    return {
      orders30: last30.length,
      ordersAll: list.length,
      revenue30,
      revenueAll,
      refunds30,
      refundsAll,
      net30: revenue30 - refunds30,
      netAll: revenueAll - refundsAll,
      currency,
      topSku,
    };
  }, [orders, refunds]);

  if (orders === null) return <div className="opacity-60 mt-6">LOADING SALES…</div>;

  return (
    <div className="mt-6 pt-6" style={{ borderTop: "1px solid #000" }}>
      <div className="mb-3">SALES DASHBOARD</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="ORDERS (30D)" value={String(stats.orders30)} />
        <Stat label="GROSS (30D)" value={`${stats.currency} ${stats.revenue30.toFixed(2)}`} />
        <Stat label="REFUNDS (30D)" value={`−${stats.currency} ${stats.refunds30.toFixed(2)}`} />
        <Stat label="NET (30D)" value={`${stats.currency} ${stats.net30.toFixed(2)}`} />
        <Stat label="ORDERS (ALL)" value={String(stats.ordersAll)} />
        <Stat label="GROSS (ALL)" value={`${stats.currency} ${stats.revenueAll.toFixed(2)}`} />
        <Stat label="REFUNDS (ALL)" value={`−${stats.currency} ${stats.refundsAll.toFixed(2)}`} />
        <Stat label="NET (ALL)" value={`${stats.currency} ${stats.netAll.toFixed(2)}`} />
      </div>
      <div className="mt-4">
        <div className="opacity-60 mb-1">TOP SKUS</div>
        {stats.topSku.length === 0 && <div className="opacity-60">—</div>}
        {stats.topSku.map(([sku, v]) => (
          <div key={sku} className="flex justify-between py-1" style={{ borderBottom: "1px solid rgba(0,0,0,0.15)" }}>
            <span>{sku}</span>
            <span>{v.qty} SOLD · £{v.revenue.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3" style={{ border: "1px solid #000" }}>
      <div className="opacity-60 text-[10px]">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}

// --- Per-order fulfillment (tracking + notes) stored in site_content ---
function OrderFulfillment({ orderId }: { orderId: string }) {
  const { content, refresh } = useSiteContent();
  const trackKey = `track_${orderId}`;
  const noteKey = `note_${orderId}`;
  const [track, setTrack] = useState(content[trackKey] ?? "");
  const [note, setNote] = useState(content[noteKey] ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setTrack(content[trackKey] ?? ""); setNote(content[noteKey] ?? ""); }, [orderId]);
  const save = async () => {
    setSaving(true);
    await saveContent(trackKey, track.trim());
    await saveContent(noteKey, note.trim());
    await refresh();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };
  return (
    <div className="mt-3 pt-2" style={{ borderTop: "1px dashed rgba(0,0,0,0.3)" }}>
      <div className="opacity-60">FULFILLMENT</div>
      <input
        value={track}
        onChange={(e) => setTrack(e.target.value)}
        placeholder="TRACKING NUMBER"
        className="ai mt-1"
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="INTERNAL NOTES"
        rows={2}
        className="ai mt-1"
        style={{ resize: "vertical", fontFamily: "inherit" }}
      />
      <button onClick={save} disabled={saving} className="aquish-hover mt-2 px-3 py-1 text-[10px]" style={{ background: "#000", color: "#fff", border: "none" }}>
        {saving ? "SAVING…" : saved ? "SAVED" : "SAVE FULFILLMENT"}
      </button>
    </div>
  );
}



// --- Refunds log ---
type RefundRow = {
  key: string;
  id: string;
  orderId?: string;
  amount: number;
  currency: string;
  reason?: string;
  createdAt: string;
};

function RefundsPanel() {
  const list = useServerFn(adminListRefunds);
  const create = useServerFn(adminCreateRefund);
  const remove = useServerFn(adminDeleteRefund);
  const [rows, setRows] = useState<RefundRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await list();
      setRows(r as RefundRow[]);
    } catch (e: any) {
      setErr(e?.message ?? "LOAD FAILED");
    }
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setErr(null);
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) { setErr("AMOUNT REQUIRED"); return; }
    setBusy(true);
    try {
      await create({ data: { orderId, amount: amt, currency, reason } });
      setOrderId(""); setAmount(""); setReason(""); setOpen(false);
      load();
    } catch (e: any) {
      setErr(e?.message ?? "CREATE FAILED");
    } finally {
      setBusy(false);
    }
  };

  const del = async (key: string) => {
    if (!confirm("DELETE THIS REFUND?")) return;
    try {
      await remove({ data: { key } });
      load();
    } catch (e: any) {
      setErr(e?.message ?? "DELETE FAILED");
    }
  };

  const total = (rows ?? []).reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div className="mt-10 pt-6" style={{ borderTop: "1px solid #000" }}>
      <div className="flex items-center justify-between mb-3">
        <div>REFUNDS LOG ({rows?.length ?? "…"})</div>
        <div className="flex gap-2">
          <button onClick={() => setOpen((v) => !v)} className="aquish-hover">
            {open ? "CLOSE" : "+ REFUND"}
          </button>
          <button onClick={load} className="aquish-hover">REFRESH</button>
        </div>
      </div>
      {open && (
        <div className="mb-4 p-3 flex flex-col gap-2" style={{ border: "1px solid #000" }}>
          <div className="opacity-60 text-[10px]">LOG A REFUND (SUBTRACTS FROM NET REVENUE)</div>
          <div className="grid md:grid-cols-2 gap-2">
            <input placeholder="ORDER ID (OPTIONAL)" value={orderId} onChange={(e) => setOrderId(e.target.value)} className="p-2" style={{ border: "1px solid #000" }} />
            <input placeholder="AMOUNT (e.g. 49.00)" value={amount} onChange={(e) => setAmount(e.target.value)} className="p-2" style={{ border: "1px solid #000" }} />
            <input placeholder="CURRENCY" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="p-2" style={{ border: "1px solid #000" }} />
            <input placeholder="REASON" value={reason} onChange={(e) => setReason(e.target.value)} className="p-2" style={{ border: "1px solid #000" }} />
          </div>
          <button onClick={submit} disabled={busy} className="aquish-hover p-2 self-start" style={{ border: "1px solid #000" }}>
            {busy ? "SAVING…" : "LOG REFUND"}
          </button>
        </div>
      )}
      {err && <div className="opacity-70 mb-2">{err.toUpperCase()}</div>}
      {rows && rows.length === 0 && <div className="opacity-60 py-4">NO REFUNDS LOGGED</div>}
      <div className="flex flex-col">
        {rows?.map((r) => (
          <div key={r.key} className="flex items-center gap-3 p-2" style={{ borderBottom: "1px solid #000" }}>
            <div className="flex-1">
              <div>{r.orderId ? `ORDER ${r.orderId}` : "NO ORDER LINKED"}</div>
              <div className="opacity-60 text-[10px]">
                {new Date(r.createdAt).toLocaleString()}
                {r.reason ? ` · ${r.reason.toUpperCase()}` : ""}
              </div>
            </div>
            <div>−{r.currency} {r.amount.toFixed(2)}</div>
            <button onClick={() => del(r.key)} className="aquish-hover px-2 py-1 text-[10px]" style={{ border: "1px solid #000", color: "#900" }}>
              DELETE
            </button>
          </div>
        ))}
      </div>
      {rows && rows.length > 0 && (
        <div className="mt-3 flex justify-end opacity-80">TOTAL REFUNDED: −{rows[0]?.currency ?? "GBP"} {total.toFixed(2)}</div>
      )}
    </div>
  );
}

// --- Revenue trends with date filter + PDF/CSV export ---
type TrendOrder = { total: number; currency: string; status: string; created_at: string };

function RevenueTrends() {
  const [orders, setOrders] = useState<TrendOrder[] | null>(null);
  const [granularity, setGranularity] = useState<"day" | "week" | "month" | "year">("day");
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("total, currency, status, created_at")
        .order("created_at", { ascending: true })
        .limit(5000);
      setOrders((data as unknown as TrendOrder[]) ?? []);
    })();
  }, []);

  const presetRange = (key: "7" | "31" | "93" | "365" | "ytd") => {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    if (key === "ytd") { start.setMonth(0); start.setDate(1); }
    else start.setDate(now.getDate() - Number(key));
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  };

  const { buckets, currency, totalGross, totalOrders } = useMemo(() => {
    const list = (orders ?? []).filter((o) => o.status !== "cancelled");
    const startMs = new Date(from + "T00:00:00").getTime();
    const endMs = new Date(to + "T23:59:59").getTime();
    const filtered = list.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return t >= startMs && t <= endMs;
    });

    const fmtKey = (d: Date): string => {
      if (granularity === "day") return d.toISOString().slice(0, 10);
      if (granularity === "month") return d.toISOString().slice(0, 7);
      if (granularity === "year") return String(d.getUTCFullYear());
      // week → ISO week start (Mon)
      const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const day = dt.getUTCDay() || 7;
      dt.setUTCDate(dt.getUTCDate() - day + 1);
      return dt.toISOString().slice(0, 10);
    };

    const map = new Map<string, { orders: number; gross: number }>();
    // Seed empty periods
    const seed = new Date(startMs);
    const limit = new Date(endMs);
    while (seed <= limit) {
      const k = fmtKey(new Date(seed));
      if (!map.has(k)) map.set(k, { orders: 0, gross: 0 });
      if (granularity === "day") seed.setUTCDate(seed.getUTCDate() + 1);
      else if (granularity === "week") seed.setUTCDate(seed.getUTCDate() + 7);
      else if (granularity === "month") seed.setUTCMonth(seed.getUTCMonth() + 1);
      else seed.setUTCFullYear(seed.getUTCFullYear() + 1);
    }
    for (const o of filtered) {
      const k = fmtKey(new Date(o.created_at));
      const cur = map.get(k) ?? { orders: 0, gross: 0 };
      cur.orders += 1;
      cur.gross += o.total || 0;
      map.set(k, cur);
    }
    const buckets: RevenueBucket[] = [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([label, v]) => ({ label, orders: v.orders, gross: v.gross }));
    return {
      buckets,
      currency: filtered[0]?.currency ?? list[0]?.currency ?? "GBP",
      totalGross: buckets.reduce((s, b) => s + b.gross, 0),
      totalOrders: buckets.reduce((s, b) => s + b.orders, 0),
    };
  }, [orders, from, to, granularity]);

  if (orders === null) return <div className="opacity-60 mt-6">LOADING TRENDS…</div>;

  const max = Math.max(1, ...buckets.map((b) => b.gross));

  return (
    <div className="mt-6 pt-6" style={{ borderTop: "1px solid #000" }}>
      <div className="mb-3">REVENUE TRENDS</div>
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <label className="flex flex-col text-[10px] opacity-70">FROM
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="p-2 text-xs" style={{ border: "1px solid #000" }} />
        </label>
        <label className="flex flex-col text-[10px] opacity-70">TO
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="p-2 text-xs" style={{ border: "1px solid #000" }} />
        </label>
        <label className="flex flex-col text-[10px] opacity-70">GRANULARITY
          <select value={granularity} onChange={(e) => setGranularity(e.target.value as any)} className="p-2 text-xs" style={{ border: "1px solid #000" }}>
            <option value="day">DAY</option>
            <option value="week">WEEK</option>
            <option value="month">MONTH</option>
            <option value="year">YEAR</option>
          </select>
        </label>
        <div className="flex gap-1 flex-wrap">
          {(["7","31","93","365","ytd"] as const).map((k) => (
            <button key={k} onClick={() => presetRange(k)} className="aquish-hover px-2 py-1 text-[10px]" style={{ border: "1px solid #000" }}>
              {k === "ytd" ? "YTD" : `${k}D`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Stat label="ORDERS" value={String(totalOrders)} />
        <Stat label="GROSS" value={`${currency} ${totalGross.toFixed(2)}`} />
        <Stat label="AOV" value={`${currency} ${(totalOrders ? totalGross / totalOrders : 0).toFixed(2)}`} />
        <Stat label="PERIODS" value={String(buckets.length)} />
      </div>

      <div className="flex items-end gap-1 mb-3 overflow-x-auto" style={{ height: 140, border: "1px solid #000", padding: 6 }}>
        {buckets.map((b) => (
          <div key={b.label} className="flex flex-col items-center justify-end" style={{ minWidth: 14 }}>
            <div
              title={`${b.label}: ${currency} ${b.gross.toFixed(2)} · ${b.orders} orders`}
              style={{ background: "#000", width: 10, height: `${(b.gross / max) * 100}%` }}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <ExportMenu
          label="EXPORT"
          options={[
            { key: "csv", label: "DOWNLOAD CSV", onSelect: () => exportRevenueCsv(buckets, currency, granularity) },
            { key: "pdf", label: "DOWNLOAD PDF", onSelect: () => exportRevenuePdf(buckets, currency, granularity, from, to) },
          ]}
        />
      </div>
    </div>
  );
}

function RevenueTrendsModal() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6 pt-6" style={{ borderTop: "1px solid #000" }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="aquish-hover px-3 py-2 text-[11px] tracking-widest"
        style={{ border: "1px solid #000" }}
      >
        VIEW REVENUE TRENDS
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] overflow-auto p-6"
            style={{ background: "#fff", border: "1px solid #000" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs tracking-widest">REVENUE TRENDS</div>
              <button onClick={() => setOpen(false)} className="aquish-hover px-2 py-1 text-[10px]" style={{ border: "1px solid #000" }}>CLOSE</button>
            </div>
            <RevenueTrends />
          </div>
        </div>
      )}
    </div>
  );
}
