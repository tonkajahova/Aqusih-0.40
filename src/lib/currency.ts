import { useEffect, useState } from "react";

type CurrencyInfo = {
  code: string;
  symbol: string;
};

const SESSION_KEY = "aquish_currency_v2";

const SYMBOLS: Record<string, string> = {
  GBP: "£", USD: "$", EUR: "€", JPY: "¥", AUD: "A$", CAD: "C$",
  NZD: "NZ$", CHF: "CHF ", CNY: "¥", HKD: "HK$", SGD: "S$", INR: "₹",
  KRW: "₩", BRL: "R$", MXN: "MX$", ZAR: "R", SEK: "kr ", NOK: "kr ",
  DKK: "kr ", PLN: "zł ", AED: "د.إ ", TRY: "₺", RUB: "₽", THB: "฿",
};

// Used to detect source currency from a free-form price string.
// Order matters: longer/specific symbols first.
const SYMBOL_TO_CODE: [string, string][] = [
  ["NZ$", "NZD"], ["A$", "AUD"], ["C$", "CAD"], ["HK$", "HKD"], ["S$", "SGD"], ["MX$", "MXN"], ["R$", "BRL"],
  ["kr", "SEK"], ["zł", "PLN"], ["CHF", "CHF"],
  ["£", "GBP"], ["$", "USD"], ["€", "EUR"], ["¥", "JPY"], ["₹", "INR"], ["₩", "KRW"],
  ["₺", "TRY"], ["₽", "RUB"], ["฿", "THB"], ["د.إ", "AED"],
  ["R", "ZAR"],
];

export function parsePrice(input: string): { code: string; amount: number } | null {
  if (!input) return null;
  const trimmed = input.trim();
  // Try ISO code prefix/suffix
  const isoMatch = trimmed.match(/^([A-Z]{3})\s*([\d.,]+)$|^([\d.,]+)\s*([A-Z]{3})$/);
  if (isoMatch) {
    const code = (isoMatch[1] || isoMatch[4])!;
    const num = parseFloat((isoMatch[2] || isoMatch[3])!.replace(/,/g, ""));
    if (!isNaN(num)) return { code, amount: num };
  }
  for (const [sym, code] of SYMBOL_TO_CODE) {
    const idx = trimmed.indexOf(sym);
    if (idx !== -1) {
      const num = parseFloat(trimmed.replace(sym, "").replace(/,/g, "").trim());
      if (!isNaN(num)) return { code, amount: num };
    }
  }
  const num = parseFloat(trimmed.replace(/,/g, ""));
  if (!isNaN(num)) return { code: "USD", amount: num };
  return null;
}

const DEFAULT: CurrencyInfo = { code: "GBP", symbol: "£" };

let userCurrency: CurrencyInfo | null = null;
let userInflight: Promise<CurrencyInfo> | null = null;
const ratesCache: Record<string, Record<string, number>> = {};
const ratesInflight: Record<string, Promise<Record<string, number>>> = {};

async function loadUserCurrency(): Promise<CurrencyInfo> {
  if (userCurrency) return userCurrency;
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      userCurrency = JSON.parse(raw);
      return userCurrency!;
    }
  } catch {}
  if (userInflight) return userInflight;
  userInflight = (async () => {
    try {
      const ipRes = await fetch("https://ipapi.co/json/");
      const ipData = await ipRes.json();
      const code: string = ipData.currency || "GBP";
      const info: CurrencyInfo = { code, symbol: SYMBOLS[code] ?? code + " " };
      userCurrency = info;
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(info)); } catch {}
      return info;
    } catch {
      userCurrency = DEFAULT;
      return DEFAULT;
    }
  })();
  return userInflight;
}

async function loadRates(base: string): Promise<Record<string, number>> {
  if (base in ratesCache) return ratesCache[base];
  if (base in ratesInflight) return ratesInflight[base];
  ratesInflight[base] = (async () => {
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
      const data = await res.json();
      const rates = data?.rates ?? {};
      ratesCache[base] = rates;
      return rates;
    } catch {
      ratesCache[base] = {};
      return {};
    }
  })();
  return ratesInflight[base];
}

/** Synchronously convert an amount between currency codes if rates are cached.
 * Returns the original amount if rates are unavailable. Triggers a background
 * fetch so a subsequent call resolves. */
export function convertAmount(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const r = ratesCache[from]?.[to];
  if (r) return amount * r;
  // try via GBP base
  const fromGbp = ratesCache["GBP"]?.[from];
  const toGbp = ratesCache["GBP"]?.[to];
  if (fromGbp && toGbp) return (amount / fromGbp) * toGbp;
  loadRates(from);
  loadRates("GBP");
  return amount;
}


export function useCurrency() {
  const [info, setInfo] = useState<CurrencyInfo>(userCurrency ?? DEFAULT);
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadUserCurrency().then((i) => {
      if (cancelled) return;
      setInfo(i);
    });
    return () => { cancelled = true; };
  }, []);

  const format = (priceStr: string) => {
    const parsed = parsePrice(priceStr);
    if (!parsed) return priceStr;
    const target = info.code;
    if (parsed.code === target) {
      return `${SYMBOLS[target] ?? target + " "}${parsed.amount.toFixed(2)}`;
    }
    const rates = ratesCache[parsed.code];
    if (!rates) {
      // kick off load, fall back to original
      loadRates(parsed.code).then(() => force((n) => n + 1));
      return `${SYMBOLS[parsed.code] ?? parsed.code + " "}${parsed.amount.toFixed(2)}`;
    }
    const rate = rates[target];
    if (!rate) {
      return `${SYMBOLS[parsed.code] ?? parsed.code + " "}${parsed.amount.toFixed(2)}`;
    }
    const converted = parsed.amount * rate;
    return `${SYMBOLS[target] ?? target + " "}${converted.toFixed(2)}`;
  };

  return { ...info, format };
}
