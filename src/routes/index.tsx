import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useStore,
  addToBag,
  removeFromBag,
  updateBagQty,
  loadFromCloud,
  getColorImages,
  getAllColors,
  type Product,
} from "@/lib/store";
import { useCurrency, parsePrice } from "@/lib/currency";
import { useAuth } from "@/hooks/use-auth";
import { useSiteContent, getProductSale, getProductDrop, discountedPrice, type ContentMap } from "@/lib/site-content";
import { Footer } from "@/components/Footer";
import { Countdown } from "@/components/Countdown";
import { formatDropCountdown, getDropUrgency, dropDiffMs } from "@/lib/drop-time";

import { Reveal } from "@/components/effects/Reveal";
import { Tilt } from "@/components/effects/Tilt";
import { useDropTitle } from "@/hooks/use-drop-title";
import { useServerFn } from "@tanstack/react-start";
import { subscribeRestockNotify } from "@/lib/notify.functions";
import { User, Code2, ShoppingBag } from "lucide-react";
import aquishLogo from "@/assets/aquish-logo.png";




export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AQUISH" },
      { name: "description", content: "AQUISH — apparel & footwear." },
    ],
  }),
  component: Storefront,
});

function Storefront() {
  const navigate = useNavigate();
  const categoriesRaw = useStore((s) => s.categories);
  const productsRaw = useStore((s) => s.products);
  const bag = useStore((s) => s.bag);
  const categories = useMemo(
    () => [...categoriesRaw].sort((a, b) => a.order - b.order),
    [categoriesRaw],
  );
  const products = useMemo(
    () =>
      productsRaw
        .filter((p) => p.status === "published")
        .sort((a, b) => a.order - b.order),
    [productsRaw],
  );
  const currency = useCurrency();
  const { content } = useSiteContent();
  // Categories, drop banner, and account/admin links are always shown —
  // admins control the footer link visibility (see UIToggles in admin).
  const showCategories = true;
  const showDrop = true;

  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  
  const [bagOpen, setBagOpen] = useState(false);

  // Load products & categories from the cloud once.
  useEffect(() => { loadFromCloud(); }, []);

  useEffect(() => {
    if (!activeCat && categories.length > 0) setActiveCat(categories[0].id);
  }, [categories, activeCat]);

  const q = query.trim().toLowerCase();
  // Split the query into individual word tokens so "black kanye shirt"
  // matches any product whose searchable text contains all three words —
  // across name, sku, description and the new product tags.
  const qTokens = q
    ? q.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)
    : [];
  const visible = useMemo(
    () => {
      const base = q
        ? products
        : products.filter((p) => !activeCat || p.categoryId === activeCat);
      if (!q) return base;
      return base.filter((p) => {
        const hay = [
          p.sku,
          p.name,
          p.id,
          p.description,
          ...(p.tags ?? []),
          ...(p.styles ?? []).map((s) => s.name),
          ...getAllColors(p).map((c) => c.name),
        ]
          .join(" ")
          .toLowerCase();
        return qTokens.every((t) => hay.includes(t));
      });
    },
    [products, activeCat, q, qTokens.join("|")],
  );

  const bagCount = bag.reduce((n, b) => n + b.qty, 0);

  // Live drop title — flashes countdown into the tab when a product is <10min from drop.
  useDropTitle(useMemo(() => products.map((p) => getProductDrop(content, p.id)), [products, content]));


  return (
    <div className="min-h-screen aquish-bg flex flex-col">
      <header
        className="fixed top-0 left-0 right-0 z-40 aquish-bg"
      >

        <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-3 items-center px-3 md:px-4 min-h-12 py-2 gap-2">
          <Link to="/" className="flex items-center min-w-0" aria-label="AQUISH home">
            <img
              src={aquishLogo}
              alt="AQUISH"
              className="h-12 md:h-14 w-auto select-none"
              draggable={false}
            />
          </Link>
          {showCategories ? (
            <>
              <div className="hidden md:block">
                <StackedCategories
                  categories={categories}
                  activeCat={activeCat}
                  setActiveCat={setActiveCat}
                />
              </div>
              <div className="md:hidden flex justify-center">
                <StackedCategories
                  categories={categories}
                  activeCat={activeCat}
                  setActiveCat={setActiveCat}
                  compact
                />
              </div>
            </>
          ) : (
            <div />
          )}
          <div className="flex justify-end items-center gap-3 md:gap-4 text-[10px] md:text-xs tracking-widest">
            <SearchBar value={query} onChange={setQuery} />
            <AccountLinks />
            <button onClick={() => setBagOpen(true)} aria-label="Bag" className="aquish-link inline-flex items-center gap-1 whitespace-nowrap">
              <ShoppingBag size={18} strokeWidth={1.5} />
              <span key={bagCount} className="aquish-bag-bump tabular-nums">{bagCount}</span>
            </button>
          </div>

        </div>

      </header>

      <main className={`flex-1 ${showCategories ? "pt-[72px] md:pt-16" : "pt-12"}`}>
        
        {showDrop && <DropBanner />}
        {visible.length === 0 ? (
          <div className="flex items-center justify-center h-[60vh] text-xs tracking-widest opacity-60">
            NO PRODUCTS
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 md:gap-x-[58px] gap-y-10 md:gap-y-10 px-3 md:px-[58px] py-6">
            {visible.map((p, i) => (
              <Reveal key={p.id} delay={Math.min(i, 8) * 50}>
                <Tilt>
                  <ProductCard
                    product={p}
                    content={content}
                    onClick={() => navigate({ to: "/product/$sku", params: { sku: p.sku } })}
                  />
                </Tilt>
              </Reveal>
            ))}
          </div>
        )}
        <Footer />
      </main>



      <BagDrawer
        open={bagOpen}
        onClose={() => setBagOpen(false)}
        currency={currency}
      />
    </div>
  );
}


function DropBanner() {
  const dropAt = useStore((s) => s.dropAt);
  if (!dropAt) return null;
  return <Countdown target={dropAt} />;
}



function StackedCategories({
  categories,
  activeCat,
  setActiveCat,
  compact = false,
}: {
  categories: { id: string; name: string }[];
  activeCat: string | null;
  setActiveCat: (id: string) => void;
  compact?: boolean;
}) {
  // Chunk categories into rows of varying sizes: 3, 2, 2, 3, 2, 2, ...
  const rowPattern = [3, 2, 2];
  const rows: { id: string; name: string }[][] = [];
  let i = 0;
  let p = 0;
  while (i < categories.length) {
    const n = rowPattern[p % rowPattern.length];
    rows.push(categories.slice(i, i + n));
    i += n;
    p += 1;
  }
  // Categories match the SKU label size (~14px = body 16 * 0.88).
  const fontSize = 14;
  if (compact) {
    const [open, setOpen] = useState(false);
    const activeName = "CATEGORIES";
    return (
      <nav className="flex flex-col items-center gap-2 leading-none" aria-label="Categories">
        <button
          onClick={() => setOpen((v) => !v)}
          className="tracking-widest aquish-link whitespace-nowrap"
          style={{
            fontSize,
            background: "transparent",
            border: "none",
            padding: "2px 0",
            cursor: "pointer",
          }}
          aria-expanded={open}
        >
          {activeName}
        </button>
        {open && (
          <div className="flex items-center justify-center gap-x-4 flex-wrap">
            {categories.map((c) => {
              const isActive = activeCat === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveCat(c.id);
                    setOpen(false);
                  }}
                  className="tracking-widest aquish-link whitespace-nowrap shrink-0"
                  style={{
                    fontSize,
                    opacity: isActive ? 1 : 0.35,
                    background: "transparent",
                    border: "none",
                    padding: "2px 0",
                    cursor: "pointer",
                  }}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </nav>
    );
  }

  return (
    <nav
      className="hidden md:flex flex-col items-center gap-1"
      aria-label="Categories"
    >
      {rows.map((row, idx) => (
        <div key={idx} className="flex justify-center gap-x-3">

          {row.map((c) => {
            const isActive = activeCat === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className="tracking-widest aquish-link whitespace-nowrap"
                style={{
                  fontSize,
                  opacity: isActive ? 1 : 0.35,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(!!value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  return (
    <div className="flex items-center gap-1">
      {open ? (
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => { if (!value) setOpen(false); }}
          placeholder="SEARCH SKU / ID / NAME"
          className="bg-transparent outline-none border-b border-black/40 px-1 py-[2px] tracking-widest"
          style={{ fontSize: "inherit", width: 160 }}
        />
      ) : null}
      <button
        type="button"
        onClick={() => { if (open && value) { onChange(""); } setOpen((o) => !o); }}
        aria-label="Search"
        className="aquish-link inline-flex"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    </div>
  );
}



function AccountLinks() {
  const { user } = useAuth();
  if (!user) return <Link to="/auth" aria-label="Account" className="aquish-link inline-flex items-center"><User size={18} strokeWidth={1.5} /></Link>;
  return (
    <>
      <Link to="/admin" aria-label="Admin" className="aquish-link inline-flex items-center"><Code2 size={18} strokeWidth={1.5} /></Link>
      <Link to="/account" aria-label="Account" className="aquish-link inline-flex items-center"><User size={18} strokeWidth={1.5} /></Link>
    </>
  );
}



function ProductCard({
  product,
  content,
  onClick,
}: {
  product: Product;
  content: ContentMap;
  onClick: () => void;
}) {
  // Build the hover cycle. If the product has multiple styles, cycle through
  // the first image of each style. Otherwise cycle through the first image of
  // every colour (across styles + standalone colours).
  const styles = product.styles ?? [];
  const cycleImages = (() => {
    if (styles.length > 1) {
      const imgs = styles
        .map((s) => getColorImages(s.colors?.[0])[0])
        .filter(Boolean) as string[];
      if (imgs.length > 1) return imgs;
    }
    const allColors = getAllColors(product);
    const imgs = allColors
      .map((c) => getColorImages(c)[0])
      .filter(Boolean) as string[];
    return imgs;
  })();
  const baseImg = cycleImages[0] ?? getColorImages(product.colors[0])[0];
  const [hovering, setHovering] = useState(false);
  const [cycleIdx, setCycleIdx] = useState(0);
  useEffect(() => {
    if (!hovering || cycleImages.length < 2) return;
    const id = setInterval(() => {
      setCycleIdx((i) => (i + 1) % cycleImages.length);
    }, 320);
    return () => clearInterval(id);
  }, [hovering, cycleImages.length]);
  useEffect(() => { if (!hovering) setCycleIdx(0); }, [hovering]);
  const img = hovering && cycleImages.length > 1 ? cycleImages[cycleIdx] : baseImg;
  const soldOut = product.stock <= 0;
  const salePct = getProductSale(content, product.id);
  const dropAt = getProductDrop(content, product.id);
  const dropping = !!dropAt;
  const clickable = !soldOut && !dropping;
  const hasWhite = getAllColors(product).some((c) => /white/i.test(c.name ?? ""));

  return (
    <button
      onClick={clickable ? onClick : undefined}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      data-has-white={hasWhite ? "" : undefined}
      className="aquish-card text-center focus:outline-none flex flex-col w-full"
      style={{
        border: "none",
        padding: 0,
        background: "transparent",
        cursor: clickable ? "pointer" : "not-allowed",
      }}
    >
      <div
        className="aspect-square w-full overflow-hidden relative flex items-center justify-center"
        style={{ opacity: soldOut ? 0.55 : 1 }}
      >
        {img ? (
          <img
            key={img}
            src={img}
            alt={product.sku}
            className="aquish-card-img aquish-card-img-fade w-full h-full md:w-4/5 md:h-4/5 object-contain block"
          />
        ) : (
          <div className="w-full h-full md:w-4/5 md:h-4/5" style={{ background: "#e5e3df" }} />
        )}


        {salePct > 0 && !dropping && (
          <div
            className="absolute top-2 left-2 px-2 py-1 tracking-widest"
            style={{ background: "#000", color: "#fff", zIndex: 2, fontSize: 10 }}
          >
            -{salePct}%
          </div>
        )}
        {dropping && <DropBar target={dropAt!} />}
      </div>
      <div className="flex flex-col items-center gap-[2px] pt-[6px] pb-2 px-2">
        <div className="tracking-widest aquish-sku">{product.sku}</div>
        {soldOut && <div className="tracking-widest opacity-70">SOLD OUT</div>}
      </div>
    </button>
  );
}

function DropTimer({ target }: { target: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, new Date(target).getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff / 3600000) % 24);
  const m = Math.floor((diff / 60000) % 60);
  const s = Math.floor((diff / 1000) % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="text-sm md:text-base tracking-widest tabular-nums">
      {d > 0 && <>{d}D </>}{pad(h)}:{pad(m)}:{pad(s)}
    </div>
  );
}

function DropBar({ target }: { target: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = dropDiffMs(target, now);
  const WINDOW = 2 * 60 * 60 * 1000; // visual fill window — last 2h fills the bar
  const pct = Math.min(100, (diff / WINDOW) * 100);
  const label = `DROPPING IN ${formatDropCountdown(diff)}`;

  const urgency = getDropUrgency(diff);
  const lastMinute = urgency === "huge";
  const last10Min = urgency === "strong";
  const lastHour = urgency === "soft";

  const animation = lastMinute
    ? "dropbar-huge 0.4s ease-in-out infinite"
    : last10Min
    ? "dropbar-strong 0.9s ease-in-out infinite"
    : lastHour
    ? "dropbar-soft 1.6s ease-in-out infinite"
    : undefined;

  const bg = lastMinute
    ? "rgba(200,0,0,0.95)"
    : last10Min
    ? "rgba(160,0,0,0.9)"
    : lastHour
    ? "rgba(0,0,0,0.85)"
    : "rgba(0,0,0,0.75)";

  const barColor = lastMinute ? "#c80000" : last10Min ? "#a00000" : "#000";

  return (
    <div
      className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex flex-col px-4"
      style={{ pointerEvents: "none", animation }}
    >
      <div
        className="text-center py-1 text-[10px] tracking-[0.3em] tabular-nums"
        style={{ background: bg, color: "#fff" }}
      >
        {label}
      </div>
      <div style={{ height: 4, background: "rgba(0,0,0,0.25)" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: barColor,
            transition: "width 1s linear",
          }}
        />
      </div>
    </div>
  );
}

export function QuickView({
  product,
  onClose,
  onPrevProduct,
  onNextProduct,
  currency,
}: {
  product: Product;
  onClose: () => void;
  onPrevProduct?: () => void;
  onNextProduct?: () => void;
  currency: ReturnType<typeof useCurrency>;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [size, setSize] = useState("");
  const [bagOverlay, setBagOverlay] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [addedFlash, setAddedFlash] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyMsg, setNotifyMsg] = useState("");
  const notifyFn = useServerFn(subscribeRestockNotify);
  const soldOut = product.stock <= 0;
  const { content } = useSiteContent();
  const salePct = getProductSale(content, product.id);
  const displayPrice = salePct > 0 ? discountedPrice(product.price, salePct) : product.price;

  const requireAuth = () => {
    if (user) return true;
    navigate({ to: "/auth", search: { next: `/product/${product.sku}` } });
    return false;
  };

  // Flat list of every image across every colour, so a single colour with
  // multiple images is browsable from one carousel without creating extra
  // colour entries (which would duplicate bag lines).
  const images = useMemo(() => {
    const arr: { colorId: string; src: string; name: string }[] = [];
    getAllColors(product).forEach((c) => {
      getColorImages(c).forEach((src) => {
        arr.push({ colorId: c.id, src, name: c.name });
      });
    });
    return arr;
  }, [product.colors, product.styles]);

  const [activeIdx, setActiveIdx] = useState(0);

  // Reset state when product changes
  useEffect(() => {
    setActiveIdx(0);
    setSize("");
    setBagOverlay(false);
    setInfoOpen(false);
  }, [product.id]);

  const safeIdx = images.length === 0 ? 0 : Math.min(activeIdx, images.length - 1);
  const current = images[safeIdx];
  const allColors = getAllColors(product);
  const colorId = current?.colorId ?? allColors[0]?.id ?? "";

  const setColorId = (id: string) => {
    const i = images.findIndex((im) => im.colorId === id);
    if (i >= 0) setActiveIdx(i);
  };

  const prevImg = () => {
    if (images.length < 2) return;
    setActiveIdx((safeIdx - 1 + images.length) % images.length);
  };
  const nextImg = () => {
    if (images.length < 2) return;
    setActiveIdx((safeIdx + 1) % images.length);
  };

  const descLines = product.description
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (bagOverlay) setBagOverlay(false);
        else if (infoOpen) setInfoOpen(false);
        else onClose();
      }
      if (e.key === "ArrowLeft") prevImg();
      if (e.key === "ArrowRight") nextImg();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [bagOverlay, infoOpen, activeIdx, images.length]);

  // Touch swipe: horizontal cycles images, vertical cycles products
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < 40) return;
    if (absX > absY) {
      if (dx < 0) nextImg();
      else prevImg();
    } else {
      // vertical: cycle products
      if (dy < 0) onNextProduct?.();
      else onPrevProduct?.();
    }
  };

  const handleAddToBag = () => {
    if (soldOut) return;
    if (!requireAuth()) return;
    addToBag({ productId: product.id, colorId, size, qty: 1 });
    setBagOverlay(false);
    setAddedFlash(true);
    setTimeout(() => {
      setAddedFlash(false);
      onClose();
    }, 900);
  };

  return (
    <div
      className="h-[100dvh] w-full aquish-bg aquish-fade-in flex flex-col overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top: product name + viewing badge + close */}
      <div className="grid grid-cols-3 items-center px-6 pt-5 pb-3 text-sm tracking-widest">
        <button onClick={onClose} className="aquish-link justify-self-start text-base">
          ×
        </button>
        <div className="justify-self-center text-center">{product.name}</div>
        <div />
      </div>


      {/* Image area with arrows close to product */}
      <div
        className="flex-1 flex items-center justify-center px-6 pt-2 pb-2 overflow-hidden"
        style={{ opacity: soldOut ? 0.55 : 1 }}
      >
        <div className="flex items-center gap-[2.2rem] md:gap-[6.6rem]">
          {images.length > 1 ? (
            <button
              onClick={prevImg}
              aria-label="Previous image"
              className="aquish-link text-2xl md:text-3xl w-8 h-8 flex items-center justify-center"
              style={{ background: "transparent", border: "none" }}
            >
              ‹
            </button>
          ) : (
            <div className="w-8 h-8" />
          )}
          <div
            className="flex items-center justify-center"
            style={{ width: "min(46vh, 70vw)", height: "min(46vh, 70vw)" }}
          >
            {current?.src ? (
              <img
                src={current.src}
                alt={product.sku}
                className="max-h-full max-w-full object-contain block select-none"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full" style={{ background: "#e5e3df" }} />
            )}
          </div>
          {images.length > 1 ? (
            <button
              onClick={nextImg}
              aria-label="Next image"
              className="aquish-link text-2xl md:text-3xl w-8 h-8 flex items-center justify-center"
              style={{ background: "transparent", border: "none" }}
            >
              ›
            </button>
          ) : (
            <div className="w-8 h-8" />
          )}
        </div>
      </div>

      {/* Carousel dots */}
      {images.length > 1 && (
        <div className="flex justify-center gap-2 pb-[2.1rem]">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              aria-label={img.name ? `${img.name} ${i + 1}` : `IMAGE ${i + 1}`}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                border: "none",
                padding: 0,
                background: i === safeIdx ? "#000" : "#bbb",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      )}

      {/* Centered stacked: PRICE / INFORMATION / ADD TO BAG */}
      <div className="flex flex-col items-center gap-1 pb-[18vh] pt-[0.85rem] text-[15.44px] md:text-[15.6px] font-semibold md:font-medium tracking-widest">
        {salePct > 0 ? (
          <div className="flex items-center gap-2">
            <span className="opacity-50 line-through">{currency.format(product.price)}</span>
            <span>{currency.format(displayPrice)}</span>
            <span className="text-[10px] tracking-widest" style={{ background: "#000", color: "#fff", padding: "2px 6px" }}>-{salePct}%</span>
          </div>
        ) : (
          <div>{currency.format(product.price)}</div>
        )}
        <button
          onClick={() => setInfoOpen(true)}
          className="aquish-link"
        >
          INFORMATION
        </button>
        <button
          onClick={() => {
            if (soldOut) { setNotifyOpen(true); return; }
            if (requireAuth()) setBagOverlay(true);
          }}
          className="aquish-link inline-flex items-center gap-1"
        >
          {soldOut ? "NOTIFY ME WHEN BACK" : "ADD TO BAG"}
          <span aria-hidden>+</span>
        </button>
      </div>





      {/* ADD TO BAG side panel — minimal, lets the image stay visible */}
      {bagOverlay && (
        <BagSelector
          product={product}
          soldOut={soldOut}
          size={size}
          setSize={setSize}
          colorId={colorId}
          setColorId={setColorId}
          onClose={() => setBagOverlay(false)}
          onConfirm={handleAddToBag}
        />
      )}

      {/* NOTIFY ME overlay */}
      {notifyOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center aquish-fade-in"
          style={{ background: "rgba(245,244,240,0.96)" }}
          onClick={() => setNotifyOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md p-6 flex flex-col gap-4 text-sm tracking-widest aquish-bg"
            style={{ border: "1px solid #000" }}
          >
            <div className="flex items-center justify-between">
              <div>NOTIFY ME — {product.name}</div>
              <button onClick={() => setNotifyOpen(false)} className="aquish-link">×</button>
            </div>
            <p className="text-[10px] opacity-60">
              ENTER YOUR EMAIL AND WE'LL LET YOU KNOW THE MOMENT THIS PIECE IS BACK IN STOCK.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setNotifyMsg("");
                try {
                  await notifyFn({ data: { sku: product.sku, email: notifyEmail } });
                  setNotifyMsg("YOU'RE ON THE LIST.");
                  setNotifyEmail("");
                } catch {
                  setNotifyMsg("SOMETHING WENT WRONG. TRY AGAIN.");
                }
              }}
              className="flex flex-col gap-3"
            >
              <input
                type="email"
                required
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="YOU@DOMAIN.COM"
                className="aquish-input w-full px-3 py-3 text-xs tracking-widest"
                style={{ border: "1px solid #000", background: "transparent" }}
              />
              <button
                type="submit"
                className="w-full py-4 text-sm tracking-widest aquish-btn-primary"
                style={{ background: "#000", color: "#fff", border: "none" }}
              >
                NOTIFY ME
              </button>
              {notifyMsg && <div className="text-[10px] opacity-70">{notifyMsg}</div>}
            </form>
          </div>
        </div>
      )}

      {/* INFORMATION overlay */}
      {infoOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center aquish-fade-in"
          style={{ background: "rgba(245,244,240,0.96)" }}
          onClick={() => setInfoOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[240px] p-3 flex flex-col gap-2 text-[9px] tracking-widest aquish-bg"
            style={{ border: "1px solid #000" }}
          >
            <div className="flex items-center justify-between">
              <div>{product.name}</div>
              <button onClick={() => setInfoOpen(false)} className="aquish-link">
                ×
              </button>
            </div>
            <div className="text-xs opacity-70">SKU — {product.sku}</div>
            <div className="text-xs opacity-70">PRODUCT ID — {product.id}</div>
            <div className="text-xs">
              {salePct > 0 ? (
                <>
                  <span className="opacity-50 line-through mr-2">{currency.format(product.price)}</span>
                  <span>{currency.format(displayPrice)}</span>
                  <span className="ml-2" style={{ background: "#000", color: "#fff", padding: "1px 5px", fontSize: 10 }}>-{salePct}%</span>
                </>
              ) : (
                currency.format(product.price)
              )}
            </div>
            <div
              className="flex flex-col gap-2 pt-3"
              style={{ borderTop: "1px solid #000" }}
            >
              {descLines.length === 0 ? (
                <div className="text-xs opacity-60">NO INFORMATION</div>
              ) : (
                descLines.map((l, i) => (
                  <div key={i} className="text-xs">
                    {l}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADDED TO BAG flash */}
      {addedFlash && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none"
          style={{ background: "rgba(245,244,240,0.85)" }}
        >
          <div className="aquish-pop text-lg tracking-widest">ADDED TO BAG</div>
        </div>
      )}
    </div>
  );
}

function BagDrawer({
  open,
  onClose,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  currency: ReturnType<typeof useCurrency>;
}) {
  const bag = useStore((s) => s.bag);
  const products = useStore((s) => s.products);
  const { content } = useSiteContent();
  const navigate = useNavigate();

  const items = bag.map((b, i) => {
    const p = products.find((pp) => pp.id === b.productId);
    const c = p ? getAllColors(p).find((cc) => cc.id === b.colorId) : undefined;
    return { i, b, p, c };
  });

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{
          background: "rgba(0,0,0,0.4)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 250ms ease",
        }}
      />
      <aside
        className="fixed top-0 right-0 h-full w-full max-w-md z-50 aquish-bg flex flex-col"
        style={{
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 300ms ease",
          borderLeft: "1px solid #000",
        }}
      >
        <div
          className="flex items-center justify-between p-4 text-xs tracking-widest"
          style={{ borderBottom: "1px solid #000" }}
        >
          <div>BAG</div>
          <button onClick={onClose} className="aquish-link">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {items.length === 0 && (
            <div className="p-8 text-xs tracking-widest opacity-60">EMPTY</div>
          )}
          {items.map(({ i, b, p, c }) => {
            const salePct = p ? getProductSale(content, p.id) : 0;
            const effectivePrice = p && salePct > 0 ? discountedPrice(p.price, salePct) : p?.price ?? "";
            const parsed = effectivePrice ? parsePrice(effectivePrice) : null;
            const lineStr =
              p && parsed
                ? currency.format(`${parsed.code} ${(parsed.amount * b.qty).toFixed(2)}`)
                : "";
            return (
              <div
                key={i}
                className="flex gap-3 p-4 text-xs tracking-widest"
                style={{ borderBottom: "1px solid #000" }}
              >
                <div style={{ width: 80, height: 80, flexShrink: 0 }}>
                  {(() => {
                    const thumb = getColorImages(c)[0];
                    return thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full" style={{ background: "#e5e3df" }} />
                    );
                  })()}
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <div>{p?.sku ?? "—"}</div>
                  <div>
                    {c?.name} / {b.size}
                  </div>
                  <div>{lineStr}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => updateBagQty(i, b.qty - 1)}
                      className="aquish-link px-2"
                      style={{ border: "1px solid #000" }}
                    >
                      −
                    </button>
                    <span>{b.qty}</span>
                    <button
                      onClick={() => updateBagQty(i, b.qty + 1)}
                      className="aquish-link px-2"
                      style={{ border: "1px solid #000" }}
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromBag(i)}
                      className="aquish-link ml-auto"
                    >
                      REMOVE
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div
          className="p-4 flex flex-col gap-3 text-xs tracking-widest"
          style={{ borderTop: "1px solid #000" }}
        >
          <button
            disabled={items.length === 0}
            onClick={() => {
              onClose();
              navigate({ to: "/checkout" });
            }}
            className="w-full py-4 text-xs tracking-widest disabled:opacity-40 aquish-btn-primary"
            style={{ background: "#000", color: "#fff", border: "none" }}
          >
            CHECKOUT
          </button>
        </div>
      </aside>
    </>
  );
}
