// hCaptcha server-side verification.

export async function verifyCaptcha(token: string | undefined | null): Promise<boolean> {
  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) {
    console.warn("[captcha] HCAPTCHA_SECRET missing — allowing request");
    return true;
  }
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token }).toString();
    const r = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(6000),
    });
    const j: any = await r.json();
    return Boolean(j?.success);
  } catch (e) {
    console.error("[captcha] verify error", e);
    return false;
  }
}
