import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "AQUISH — RESET PASSWORD" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    // Supabase places recovery tokens in the URL hash and auto-creates a session.
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (password !== password2) { setMsg("PASSWORDS DO NOT MATCH"); return; }
    if (password.length < 6) { setMsg("PASSWORD MUST BE AT LEAST 6 CHARACTERS"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setMsg(error.message.toUpperCase()); return; }
    setMsg("PASSWORD UPDATED — REDIRECTING…");
    setTimeout(() => navigate({ to: "/account" }), 900);
  };

  return (
    <div className="min-h-screen aquish-bg flex flex-col items-center justify-center px-6 relative">
      <Link to="/auth" className="absolute top-5 left-5 inline-flex items-center gap-2 text-xs tracking-widest aquish-link">
        <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>←</span>
        <span>BACK</span>
      </Link>
      <form onSubmit={submit} className="w-full max-w-sm flex flex-col gap-5 text-sm tracking-widest">
        <div className="text-center text-base">RESET PASSWORD</div>
        {!ready ? (
          <div className="text-xs text-center opacity-70">
            OPEN THE RESET LINK FROM YOUR EMAIL TO CONTINUE.
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-xs">
              NEW PASSWORD
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="aquish-input" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              CONFIRM PASSWORD
              <input type="password" required minLength={6} value={password2} onChange={(e) => setPassword2(e.target.value)} className="aquish-input" />
            </label>
            <button type="submit" disabled={busy} className="py-3 text-xs tracking-widest disabled:opacity-40" style={{ background: "#000", color: "#fff", border: "none" }}>
              {busy ? "..." : "UPDATE PASSWORD"}
            </button>
          </>
        )}
        {msg && <div className="text-xs text-center opacity-80">{msg}</div>}
      </form>
    </div>
  );
}
