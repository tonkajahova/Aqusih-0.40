import { createHash } from "crypto";

// PayFast urlencode: RFC 1738 - spaces as '+', uppercase hex
export function pfEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

export function pfSignature(
  fields: Record<string, string>,
  passphrase?: string,
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (k === "signature") continue;
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${k}=${pfEncode(String(v).trim())}`);
  }
  let s = parts.join("&");
  if (passphrase && passphrase.length > 0) {
    s += `&passphrase=${pfEncode(passphrase.trim())}`;
  }
  return createHash("md5").update(s).digest("hex");
}

export function pfMode(): "sandbox" | "live" {
  return (process.env.PAYFAST_MODE ?? "sandbox") === "live" ? "live" : "sandbox";
}

export function pfProcessUrl(): string {
  return pfMode() === "live"
    ? "https://www.payfast.co.za/eng/process"
    : "https://sandbox.payfast.co.za/eng/process";
}

export function pfValidateUrl(): string {
  return pfMode() === "live"
    ? "https://www.payfast.co.za/eng/query/validate"
    : "https://sandbox.payfast.co.za/eng/query/validate";
}

// Approved PayFast ITN source IPs (resolve at runtime; here we keep a static
// allowlist of host ranges. PayFast publishes domains; we resolve via DNS in
// the handler if needed. For now allow the known prod/sandbox subnets.)
export const PAYFAST_HOSTS = [
  "www.payfast.co.za",
  "sandbox.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
];

export async function convertGbpToZar(amountGbp: number): Promise<number> {
  try {
    const r = await fetch(
      "https://api.exchangerate.host/latest?base=GBP&symbols=ZAR",
      { signal: AbortSignal.timeout(3500) },
    );
    if (r.ok) {
      const j: any = await r.json();
      const rate = j?.rates?.ZAR;
      if (typeof rate === "number" && rate > 0) {
        return Math.round(amountGbp * rate * 100) / 100;
      }
    }
  } catch {}
  // Fallback rate if FX lookup fails.
  return Math.round(amountGbp * 24 * 100) / 100;
}
