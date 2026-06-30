import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCaptchaSiteKey } from "@/lib/captcha.functions";

declare global {
  interface Window {
    hcaptcha?: {
      render: (el: HTMLElement, opts: { sitekey: string; theme?: string; callback: (token: string) => void; "expired-callback"?: () => void }) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
    __hcaptchaLoading?: Promise<void>;
  }
}

function loadHCaptcha(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.hcaptcha) return Promise.resolve();
  if (window.__hcaptchaLoading) return window.__hcaptchaLoading;
  window.__hcaptchaLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.hcaptcha.com/1/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("hCaptcha failed to load"));
    document.head.appendChild(s);
  });
  return window.__hcaptchaLoading;
}

export function HCaptchaWidget({
  onToken,
}: {
  onToken: (token: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const getKey = useServerFn(getCaptchaSiteKey);

  useEffect(() => {
    getKey().then((r) => setSiteKey(r.siteKey || null)).catch(() => setSiteKey(null));
  }, []);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;
    loadHCaptcha()
      .then(() => {
        if (cancelled || !window.hcaptcha || !ref.current) return;
        if (widgetId.current) return;
        widgetId.current = window.hcaptcha.render(ref.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (widgetId.current && window.hcaptcha) {
        try { window.hcaptcha.remove(widgetId.current); } catch {}
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={ref} className="self-center" />;
}
