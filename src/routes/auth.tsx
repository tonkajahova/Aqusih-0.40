import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { claimAdminRole } from "@/lib/auth.functions";
import { useAuth } from "@/hooks/use-auth";
import { HCaptchaWidget } from "@/components/HCaptchaWidget";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "AQUISH — ACCOUNT" }] }),
  validateSearch: searchSchema,
  component: AuthPage,
});

const RESEND_KEY = "aquish_resend_ts_v1";
const RESEND_MAX = 3;
const RESEND_WINDOW_MS = 10 * 60 * 1000;

function recordResend(): { allowed: boolean; remaining: number; waitMs: number } {
  if (typeof window === "undefined") return { allowed: true, remaining: RESEND_MAX, waitMs: 0 };
  const now = Date.now();
  let arr: number[] = [];
  try { arr = JSON.parse(window.localStorage.getItem(RESEND_KEY) || "[]"); } catch {}
  arr = arr.filter((t) => now - t < RESEND_WINDOW_MS);
  if (arr.length >= RESEND_MAX) {
    return { allowed: false, remaining: 0, waitMs: RESEND_WINDOW_MS - (now - arr[0]) };
  }
  arr.push(now);
  window.localStorage.setItem(RESEND_KEY, JSON.stringify(arr));
  return { allowed: true, remaining: RESEND_MAX - arr.length, waitMs: 0 };
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/auth" });
  const { user, loading } = useAuth();
  const claim = useServerFn(claimAdminRole);

  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      const dest = next && next.startsWith("/") ? next : "/";
      navigate({ to: dest });
    }
  }, [user, loading, next]);

  const oauth = async (provider: "google" | "apple") => {
    setBusy(true);
    setMsg(null);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) setMsg(String((result.error as any)?.message ?? result.error));
    } catch (err: any) {
      setMsg(err?.message ?? "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const resendConfirmation = async () => {
    const r = recordResend();
    if (!r.allowed) {
      const mins = Math.ceil(r.waitMs / 60000);
      setMsg(`RATE LIMIT — TRY AGAIN IN ${mins} MIN`);
      return;
    }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: window.location.origin + "/auth" },
    });
    setMsg(error ? error.message.toUpperCase() : `EMAIL SENT (${r.remaining} LEFT IN 10 MIN)`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setNeedsConfirm(false);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        setMsg("RESET EMAIL SENT — CHECK YOUR INBOX");
      } else if (mode === "signup") {
        if (password !== password2) throw new Error("PASSWORDS DO NOT MATCH");
        if (password.length < 6) throw new Error("PASSWORD MUST BE AT LEAST 6 CHARACTERS");
        if (!captchaToken) throw new Error("PLEASE COMPLETE THE CAPTCHA");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/auth" },
        });
        if (error) throw error;
        if (adminCode) {
          const sess = await supabase.auth.getSession();
          if (sess.data.session) {
            const r = await claim({ data: { code: adminCode } });
            if (!r.ok) setMsg("ACCOUNT CREATED. ADMIN CODE WAS INCORRECT.");
            else setMsg("ACCOUNT CREATED. ADMIN ACCESS GRANTED.");
          } else {
            setMsg("CHECK YOUR EMAIL TO CONFIRM YOUR ACCOUNT.");
            setNeedsConfirm(true);
          }
        } else {
          setMsg("CHECK YOUR EMAIL TO CONFIRM YOUR ACCOUNT.");
          setNeedsConfirm(true);
        }
      } else {
        if (!captchaToken) throw new Error("PLEASE COMPLETE THE CAPTCHA");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (/confirm/i.test(error.message)) setNeedsConfirm(true);
          throw error;
        }
        if (adminCode) {
          const r = await claim({ data: { code: adminCode } });
          setMsg(r.ok ? "SIGNED IN. ADMIN ACCESS GRANTED." : "SIGNED IN. ADMIN CODE WAS INCORRECT.");
        }
      }
    } catch (err: any) {
      setMsg((err?.message ?? "SOMETHING WENT WRONG").toUpperCase());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen aquish-bg flex flex-col items-center justify-center px-6 relative">
      <Link
        to="/"
        className="absolute top-5 left-5 inline-flex items-center gap-2 text-xs tracking-widest aquish-link"
        aria-label="Back to products"
      >
        <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>←</span>
        <span>BACK</span>
      </Link>
      <form onSubmit={submit} className="w-full max-w-sm flex flex-col gap-5 text-sm tracking-widest">
        <div className="text-center text-base">AQUISH</div>
        <div className="flex justify-center gap-6 text-xs">
          <button type="button" onClick={() => { setMode("signin"); setMsg(null); }} className={mode === "signin" ? "underline underline-offset-4" : "aquish-link"}>SIGN IN</button>
          <button type="button" onClick={() => { setMode("signup"); setMsg(null); }} className={mode === "signup" ? "underline underline-offset-4" : "aquish-link"}>CREATE ACCOUNT</button>
        </div>

        {mode !== "forgot" && (
          <div className="flex flex-col gap-2">
            <button type="button" disabled={busy} onClick={() => oauth("google")}
              className="py-3 text-xs tracking-widest disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: "#fff", color: "#000", border: "1px solid #000" }}>
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.8 6.4 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.3-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15.1 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.8 6.4 29.1 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.1z"/>
                <path fill="#4CAF50" d="M24 43.5c5 0 9.6-1.9 13-5l-6-5.1c-2 1.4-4.4 2.1-7 2.1-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.5 38.9 16.2 43.5 24 43.5z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.4 4.3-4.3 5.4l6 5.1c-.4.4 6.5-4.7 6.5-14.5 0-1.2-.1-2.3-.3-3.5z"/>
              </svg>
              CONTINUE WITH GOOGLE
            </button>
            <button type="button" disabled={busy} onClick={() => oauth("apple")}
              className="py-3 text-xs tracking-widest disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: "#000", color: "#fff", border: "1px solid #000" }}>
              <svg width="16" height="16" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM236.5 105.3c25.5-30.3 23.2-58 22.5-67.9-22.6 1.3-48.7 15.4-63.6 32.7-16.4 18.6-26 41.6-23.9 67.4 24.4 1.9 46.7-10.6 65-32.2z"/>
              </svg>
              CONTINUE WITH APPLE
            </button>
            <div className="text-[10px] text-center opacity-50">OR</div>
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs">
          EMAIL
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="aquish-input" />
        </label>
        {mode !== "forgot" && (
          <label className="flex flex-col gap-1 text-xs">
            PASSWORD
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="aquish-input" />
          </label>
        )}
        {mode === "signup" && (
          <label className="flex flex-col gap-1 text-xs">
            CONFIRM PASSWORD
            <input type="password" required minLength={6} value={password2} onChange={(e) => setPassword2(e.target.value)} className="aquish-input" />
          </label>
        )}
        {mode !== "forgot" && (
          <label className="flex flex-col gap-1 text-xs">
            ADMIN CODE (OPTIONAL)
            <input type="password" value={adminCode} onChange={(e) => setAdminCode(e.target.value)} className="aquish-input" placeholder="LEAVE BLANK FOR NORMAL ACCOUNT" />
          </label>
        )}
        {mode !== "forgot" && (
          <div className="flex justify-center">
            <HCaptchaWidget onToken={setCaptchaToken} />
          </div>
        )}
        <button type="submit" disabled={busy} className="py-3 text-xs tracking-widest disabled:opacity-40" style={{ background: "#000", color: "#fff", border: "none" }}>
          {busy ? "..." : mode === "signin" ? "SIGN IN" : mode === "signup" ? "CREATE ACCOUNT" : "SEND RESET EMAIL"}
        </button>

        {mode === "signin" && (
          <button type="button" onClick={() => { setMode("forgot"); setMsg(null); }} className="aquish-link text-[10px] text-center">
            FORGOT PASSWORD?
          </button>
        )}
        {mode === "forgot" && (
          <button type="button" onClick={() => { setMode("signin"); setMsg(null); }} className="aquish-link text-[10px] text-center">
            ← BACK TO SIGN IN
          </button>
        )}

        {msg && <div className="text-xs text-center opacity-80">{msg}</div>}
        {needsConfirm && email && (
          <button type="button" onClick={resendConfirmation} className="aquish-link text-[10px] text-center underline">
            RESEND CONFIRMATION EMAIL
          </button>
        )}
      </form>
    </div>
  );
}
