import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ContentMap = Record<string, string>;

export const DEFAULT_CONTENT: ContentMap = {
  contact_general: "AQUISHCLOTHING@GMAIL.COM",
  contact_orders: "AQUISHCLOTHING@GMAIL.COM",
  contact_press: "AQUISHCLOTHING@GMAIL.COM",
  about_body:
    "AQUISH IS AN INDEPENDENT APPAREL LABEL FOUNDED ON THE BELIEF THAT GOOD CLOTHING SHOULD BE QUIET, CONSIDERED AND BUILT TO LAST. WE WORK IN SMALL, INTENTIONAL DROPS — REFINING SILHOUETTES, SOURCING HONEST MATERIALS AND PRODUCING IN LIMITED RUNS TO AVOID THE WASTE OF MASS PRODUCTION. EVERY GARMENT IS DESIGNED, SAMPLED AND DISPATCHED FROM OUR STUDIO, WHICH KEEPS US CLOSE TO THE PROCESS AND ACCOUNTABLE FOR THE FINAL PRODUCT. OUR DESIGN LANGUAGE IS MINIMAL AND UTILITY-DRIVEN: NEUTRAL PALETTES, CLEAN LINES AND HARDWEARING CONSTRUCTION INTENDED TO SIT INSIDE A WARDROBE FOR YEARS RATHER THAN SEASONS. FOR ANY ENQUIRIES, COLLABORATIONS OR PRESS REQUESTS PLEASE REACH OUT AT AQUISHCLOTHING@GMAIL.COM.",
  shipping_body:
    "ALL ORDERS ARE PACKED AND DISPATCHED FROM OUR STUDIO WITHIN 3–5 BUSINESS DAYS OF PAYMENT BEING CONFIRMED. ONCE YOUR PARCEL LEAVES US YOU WILL RECEIVE AN EMAIL WITH A TRACKING NUMBER AND COURIER DETAILS. STANDARD DELIVERY INSIDE SOUTH AFRICA TYPICALLY ARRIVES WITHIN 2–5 BUSINESS DAYS DEPENDING ON YOUR REGION, WITH OUTLYING AREAS OCCASIONALLY TAKING A LITTLE LONGER. WE SHIP DOMESTICALLY ONLY AT THIS TIME. PLEASE DOUBLE-CHECK YOUR SHIPPING ADDRESS AT CHECKOUT — WE CANNOT BE HELD RESPONSIBLE FOR PARCELS DELIVERED TO AN INCORRECT ADDRESS PROVIDED BY THE CUSTOMER. IF A DELIVERY APPEARS DELAYED OR MARKED AS DELIVERED BUT NOT RECEIVED, CONTACT US WITHIN 7 DAYS AT AQUISHCLOTHING@GMAIL.COM AND WE WILL OPEN AN INVESTIGATION WITH THE COURIER.",
  terms_body:
    "BY ACCESSING OR PLACING AN ORDER THROUGH THIS SITE YOU AGREE TO BE BOUND BY THESE TERMS OF SERVICE. ALL CONTENT, IMAGERY, GRAPHICS, GARMENT DESIGNS AND BRAND MARKS DISPLAYED ON THIS SITE ARE THE INTELLECTUAL PROPERTY OF AQUISH AND MAY NOT BE REPRODUCED, REDISTRIBUTED OR USED COMMERCIALLY WITHOUT WRITTEN PERMISSION. PRICES, AVAILABILITY AND PRODUCT SPECIFICATIONS MAY CHANGE WITHOUT NOTICE. ALL ORDERS ARE SUBJECT TO ACCEPTANCE AND STOCK AVAILABILITY; WE RESERVE THE RIGHT TO CANCEL OR REFUSE ANY ORDER AT OUR DISCRETION, IN WHICH CASE ANY AMOUNT PAID WILL BE REFUNDED IN FULL. PAYMENTS ARE PROCESSED BY THIRD-PARTY PROVIDERS AND AQUISH NEVER STORES YOUR FULL CARD DETAILS. ALL SALES ARE FINAL — DUE TO THE LIMITED, MADE-TO-ORDER NATURE OF OUR DROPS WE DO NOT OFFER RETURNS, REFUNDS OR EXCHANGES ONCE AN ORDER HAS BEEN CONFIRMED, EXCEPT WHERE REQUIRED BY APPLICABLE CONSUMER LAW IN THE CASE OF A GENUINELY DEFECTIVE OR INCORRECTLY FULFILLED ITEM. IF YOU BELIEVE YOUR ORDER WAS RECEIVED FAULTY OR INCORRECT, NOTIFY US WITHIN 7 DAYS OF DELIVERY AT AQUISHCLOTHING@GMAIL.COM WITH YOUR ORDER NUMBER AND CLEAR PHOTOGRAPHS SO WE CAN ASSESS THE ISSUE. BY USING THE SITE YOU FURTHER AGREE NOT TO MISUSE IT, ATTEMPT TO INTERFERE WITH ITS OPERATION OR USE IT FOR ANY UNLAWFUL PURPOSE. THESE TERMS ARE GOVERNED BY THE LAWS OF SOUTH AFRICA. FOR ANY QUESTIONS CONTACT AQUISHCLOTHING@GMAIL.COM.",
  privacy_body:
    "AQUISH RESPECTS YOUR PRIVACY AND COLLECTS ONLY THE INFORMATION REQUIRED TO PROCESS, FULFIL AND SUPPORT YOUR ORDERS — TYPICALLY YOUR NAME, EMAIL ADDRESS, SHIPPING ADDRESS, CONTACT NUMBER AND PAYMENT REFERENCE. THIS INFORMATION IS USED SOLELY TO COMPLETE YOUR TRANSACTION, PROVIDE ORDER UPDATES, RESPOND TO SUPPORT ENQUIRIES AND COMPLY WITH OUR LEGAL OBLIGATIONS. WE NEVER SELL, RENT OR TRADE YOUR PERSONAL DATA. LIMITED INFORMATION IS SHARED WITH TRUSTED THIRD PARTIES STRICTLY FOR ORDER FULFILMENT — OUR PAYMENT PROCESSOR (PAYFAST) HANDLES YOUR CARD DETAILS DIRECTLY ON THEIR OWN SECURE INFRASTRUCTURE, AND OUR COURIER PARTNERS RECEIVE THE MINIMUM DETAILS NEEDED TO DELIVER YOUR PARCEL. ACCOUNT CREDENTIALS AND SESSION DATA ARE STORED SECURELY VIA OUR BACKEND PROVIDER. COOKIES AND LOCAL STORAGE ARE USED ONLY TO KEEP YOU SIGNED IN AND TO REMEMBER YOUR CART. YOU MAY REQUEST A COPY OF THE PERSONAL DATA WE HOLD ON YOU, OR REQUEST DELETION OF YOUR ACCOUNT AND ASSOCIATED DATA, BY EMAILING AQUISHCLOTHING@GMAIL.COM. WE WILL RESPOND WITHIN A REASONABLE TIMEFRAME AS REQUIRED BY APPLICABLE PRIVACY LAW.",
  // Per-link footer visibility ('1' = show, '0' = hide)
  ui_link_shipping: "1",
  ui_link_about: "1",
  ui_link_contact: "1",
  ui_link_terms: "1",
  ui_link_privacy: "1",
  drop_at: "",
  social_whatsapp: "",
  social_instagram: "",
};

export const orderTrackingKey = (id: string) => `track_${id}`;
export const orderNotesKey = (id: string) => `note_${id}`;


const CONTENT_KEYS = Object.keys(DEFAULT_CONTENT);
const CACHE_KEY = "aquish.site_content.v1";

function readCache(): ContentMap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ContentMap;
    const next: ContentMap = { ...DEFAULT_CONTENT, ...parsed };
    return next;
  } catch { return null; }
}

function writeCache(map: ContentMap) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export function useSiteContent() {
  const [content, setContent] = useState<ContentMap>(() => readCache() ?? DEFAULT_CONTENT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("site_content").select("key,value");
    const next: ContentMap = { ...DEFAULT_CONTENT };
    for (const row of data ?? []) next[row.key] = row.value ?? "";
    for (const k of CONTENT_KEYS) if (!(k in next)) next[k] = DEFAULT_CONTENT[k];
    setContent(next);
    writeCache(next);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { content, loading, refresh };
}

export async function saveContent(key: string, value: string) {
  if (!value) {
    return supabase.from("site_content").delete().eq("key", key);
  }
  return supabase.from("site_content").upsert({ key, value }, { onConflict: "key" });
}

// --- Per-product sale + drop overrides (stored in site_content) ---
export const productSaleKey = (id: string) => `psale_${id}`;
export const productDropKey = (id: string) => `pdrop_${id}`;

export function getProductSale(content: ContentMap, id: string): number {
  const v = parseInt(content[productSaleKey(id)] ?? "", 10);
  return Number.isFinite(v) && v > 0 && v < 100 ? v : 0;
}
export function getProductDrop(content: ContentMap, id: string): string | null {
  const v = content[productDropKey(id)];
  if (!v) return null;
  const t = new Date(v).getTime();
  if (Number.isNaN(t) || t <= Date.now()) return null;
  return v;
}

/** Apply a percent discount to a price string, preserving its currency prefix/suffix. */
export function discountedPrice(price: string, percent: number): string {
  if (!percent) return price;
  const m = price.match(/([\d.,]+)/);
  if (!m) return price;
  const num = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(num)) return price;
  const next = (num * (100 - percent)) / 100;
  return price.replace(m[1], next.toFixed(2));
}

export const CONTENT_FIELDS: { key: string; label: string; multiline?: boolean }[] = [
  { key: "contact_general", label: "CONTACT — GENERAL EMAIL" },
  { key: "contact_orders", label: "CONTACT — ORDERS EMAIL" },
  { key: "contact_press", label: "CONTACT — PRESS EMAIL" },
  { key: "about_body", label: "ABOUT — BODY", multiline: true },
  { key: "shipping_body", label: "SHIPPING — BODY", multiline: true },
  
  { key: "terms_body", label: "TERMS OF SERVICE", multiline: true },
  { key: "privacy_body", label: "PRIVACY POLICY", multiline: true },
  { key: "social_whatsapp", label: "SOCIAL — WHATSAPP URL (e.g. https://wa.me/27...)" },
  { key: "social_instagram", label: "SOCIAL — INSTAGRAM URL" },
];


export const FOOTER_LINKS: { key: string; label: string; to: string }[] = [
  { key: "ui_link_shipping", label: "SHIPPING", to: "/shipping" },
  
  { key: "ui_link_about", label: "ABOUT", to: "/about" },
  { key: "ui_link_contact", label: "CONTACT", to: "/contact" },
  { key: "ui_link_terms", label: "TERMS", to: "/terms" },
  { key: "ui_link_privacy", label: "PRIVACY", to: "/privacy" },
];

export const UI_TOGGLES = FOOTER_LINKS.map((l) => ({ key: l.key, label: `FOOTER — ${l.label}` }));
