import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listProductReviews, upsertReview, deleteMyReview } from "@/lib/reviews.functions";
import { useAuth } from "@/hooks/use-auth";

type Review = {
  id: string;
  user_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
};

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1" aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} star`}
          className={onChange ? "cursor-pointer" : "cursor-default"}
          style={{ fontSize: 16, lineHeight: 1, color: n <= value ? "#000" : "#bbb", background: "transparent", border: "none", padding: 0 }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function ProductReviews({ productId }: { productId: string }) {
  const { user } = useAuth();
  const fetchReviews = useServerFn(listProductReviews);
  const saveReview = useServerFn(upsertReview);
  const removeReview = useServerFn(deleteMyReview);

  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    fetchReviews({ data: { productId } })
      .then((r) => setReviews(r as Review[]))
      .catch(() => setReviews([]));
  };

  useEffect(() => {
    setReviews(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const mine = user ? (reviews ?? []).find((r) => r.user_id === user.id) : undefined;
  useEffect(() => {
    if (mine) {
      setRating(mine.rating);
      setTitle(mine.title ?? "");
      setBody(mine.body ?? "");
    }
  }, [mine?.id]);

  const avg = reviews && reviews.length
    ? (reviews.reduce((n, r) => n + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await saveReview({ data: { productId, rating, title, body } });
      setMsg("THANK YOU");
      load();
    } catch (err: any) {
      setMsg((err?.message ?? "FAILED").toUpperCase());
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete your review?")) return;
    setBusy(true);
    try { await removeReview({ data: { productId } }); setTitle(""); setBody(""); setRating(5); load(); }
    finally { setBusy(false); }
  };

  return (
    <section className="mt-8 px-4 py-6 text-xs tracking-widest" style={{ borderTop: "1px solid #000" }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-sm">REVIEWS</div>
        {avg && <div className="flex items-center gap-2"><Stars value={Math.round(Number(avg))} /><span>{avg} / 5 · {reviews!.length}</span></div>}
      </div>

      {user ? (
        <form onSubmit={submit} className="flex flex-col gap-3 mb-6 max-w-md">
          <div className="flex items-center gap-3">
            <span>YOUR RATING</span>
            <Stars value={rating} onChange={setRating} />
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="TITLE (OPTIONAL)" maxLength={120} className="aquish-input" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="YOUR REVIEW (OPTIONAL)" maxLength={2000} rows={3} className="aquish-input" style={{ resize: "vertical" }} />
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className="py-2 px-4 text-[11px]" style={{ background: "#000", color: "#fff" }}>
              {mine ? "UPDATE REVIEW" : "SUBMIT REVIEW"}
            </button>
            {mine && (
              <button type="button" onClick={remove} disabled={busy} className="py-2 px-4 text-[11px] aquish-link">
                DELETE
              </button>
            )}
          </div>
          {msg && <div className="opacity-70">{msg}</div>}
        </form>
      ) : (
        <div className="opacity-60 mb-6">SIGN IN TO LEAVE A REVIEW.</div>
      )}

      {reviews === null && <div className="opacity-60">LOADING…</div>}
      {reviews && reviews.length === 0 && <div className="opacity-60">NO REVIEWS YET.</div>}
      {reviews && reviews.length > 0 && (
        <ul className="flex flex-col gap-4">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 pb-3" style={{ borderBottom: "1px solid #000" }}>
              <div className="flex items-center justify-between">
                <Stars value={r.rating} />
                <span className="opacity-50 text-[10px]">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              {r.title && <div className="text-[12px]">{r.title.toUpperCase()}</div>}
              {r.body && <div className="opacity-80 leading-relaxed normal-case tracking-normal">{r.body}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
