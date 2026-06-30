import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useStore, clearBag, loadFromCloud, getColorImages } from "@/lib/store";
import { useCurrency, parsePrice, convertAmount } from "@/lib/currency";
import { useAuth } from "@/hooks/use-auth";
import { validateDiscount, createOrder } from "@/lib/commerce.functions";
import { useSiteContent, getProductSale, discountedPrice } from "@/lib/site-content";
import { HCaptchaWidget } from "@/components/HCaptchaWidget";


export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "AQUISH — CHECKOUT" },
      { name: "description", content: "AQUISH checkout." },
    ],
  }),
  component: CheckoutPage,
});

type Form = {
  email: string;
  firstName: string;
  lastName: string;
  address: string;
  apt: string;
  city: string;
  region: string;
  postal: string;
  country: string;
  phone: string;
};

const empty: Form = {
  email: "",
  firstName: "",
  lastName: "",
  address: "",
  apt: "",
  city: "",
  region: "",
  postal: "",
  country: "",
  phone: "",
};

function toGbp(amount: number, code: string): number {
  return convertAmount(amount, code, "GBP");
}


function CheckoutPage() {
  const bag = useStore((s) => s.bag);
  const products = useStore((s) => s.products);
  useEffect(() => { loadFromCloud(); }, []);
  const currency = useCurrency();
  const { user } = useAuth();
  const navigate = useNavigate();
  const validate = useServerFn(validateDiscount);
  const submitOrder = useServerFn(createOrder);

  const [form, setForm] = useState<Form>({ ...empty, email: user?.email ?? "" });
  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState<{
    code: string;
    discountGbp: number;
    label: string;
  } | null>(null);
  const [codeStatus, setCodeStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const { content } = useSiteContent();
  const items = useMemo(
    () =>
      bag.map((b, i) => {
        const p = products.find((pp) => pp.id === b.productId);
        const c = p?.colors.find((cc) => cc.id === b.colorId);
        const salePct = p ? getProductSale(content, p.id) : 0;
        const effective = p && salePct > 0 ? discountedPrice(p.price, salePct) : p?.price ?? "";
        const parsed = effective ? parsePrice(effective) : null;
        return { i, b, p, c, parsed };
      }),
    [bag, products, content],
  );

  // Subtotal in original currency code (display); subtotal in GBP (math/server)
  const subtotalGbp = items.reduce(
    (n, it) => n + (it.parsed ? toGbp(it.parsed.amount * it.b.qty, it.parsed.code) : 0),
    0,
  );
  const discountGbp = applied?.discountGbp ?? 0;
  const totalGbp = Math.max(0, subtotalGbp - discountGbp);

  const fmtGbp = (n: number) => currency.format(`GBP ${n.toFixed(2)}`);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const applyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeStatus(null);
    if (!codeInput.trim()) return;
    try {
      const r = await validate({ data: { code: codeInput.trim(), subtotalGbp } });
      if (r.ok) {
        setApplied({ code: r.code, discountGbp: r.discountGbp, label: r.label });
        setCodeStatus(`APPLIED — ${r.label}`);
      } else {
        setApplied(null);
        setCodeStatus(r.reason);
      }
    } catch {
      setCodeStatus("COULD NOT VALIDATE");
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (items.length === 0) return;
    if (!captchaToken) { setError("PLEASE COMPLETE THE CAPTCHA"); return; }
    setSubmitting(true);
    try {
      const result = await submitOrder({
        data: {
          email: form.email,
          items: items.map((it) => ({
            sku: it.p?.sku ?? "",
            name: it.p?.name ?? "",
            color: it.c?.name ?? "",
            size: it.b.size,
            qty: it.b.qty,
            unitPriceGbp: it.parsed
              ? toGbp(it.parsed.amount, it.parsed.code)
              : 0,
          })),
          shipping: {
            firstName: form.firstName,
            lastName: form.lastName,
            address: form.address,
            apt: form.apt,
            city: form.city,
            region: form.region,
            postal: form.postal,
            country: form.country,
            phone: form.phone,
          },
          discountCode: applied?.code,
          origin: window.location.origin,
          captchaToken,
        },
      });
      const orderId = result.orderId;
      const uuid = result.payfast.uuid;

      const finishRedirect = () => {
        // Fallback: classic redirect-form submit if onsite isn't available.
        const f = document.createElement("form");
        f.method = "POST";
        f.action = result.payfast.url;
        for (const [k, v] of Object.entries(result.payfast.fields)) {
          const i = document.createElement("input");
          i.type = "hidden";
          i.name = k;
          i.value = String(v);
          f.appendChild(i);
        }
        document.body.appendChild(f);
        f.submit();
      };

      if (!uuid || typeof window === "undefined") {
        clearBag();
        finishRedirect();
        return;
      }

      // Ensure the PayFast onsite engine script is loaded.
      const loadEngine = () =>
        new Promise<void>((resolve, reject) => {
          if ((window as any).payfast_do_onsite_payment) return resolve();
          const s = document.createElement("script");
          s.src = "https://www.payfast.co.za/onsite/engine.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("ENGINE LOAD FAILED"));
          document.head.appendChild(s);
        });

      try {
        await loadEngine();
      } catch {
        clearBag();
        finishRedirect();
        return;
      }

      clearBag();
      (window as any).payfast_do_onsite_payment(
        { uuid },
        (paymentResult: boolean) => {
          if (paymentResult) {
            navigate({ to: "/checkout/success", search: { order: orderId } as any });
          } else {
            setError("PAYMENT CANCELLED");
            setSubmitting(false);
          }
        },
      );
    } catch (err: any) {
      setError(err?.message ?? "ORDER FAILED");
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen aquish-bg aquish-fade-in flex items-center justify-center px-6">
        <div className="text-center flex flex-col gap-4 max-w-md">
          <div className="text-xl tracking-widest">ORDER PLACED</div>
          <div className="text-xs tracking-widest opacity-70">
            THANK YOU. A CONFIRMATION HAS BEEN SENT TO {form.email || "YOUR EMAIL"}.
          </div>
          <Link
            to="/account"
            className="aquish-link text-xs tracking-widest underline underline-offset-4 mt-4"
          >
            VIEW ORDERS
          </Link>
          <Link
            to="/"
            className="aquish-link text-xs tracking-widest underline underline-offset-4"
          >
            CONTINUE SHOPPING
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen aquish-bg aquish-fade-in">
      <header
        className="grid grid-cols-3 items-center px-4 h-12"
        style={{ borderBottom: "1px solid #000" }}
      >
        <Link to="/" className="aquish-link text-xs tracking-widest">
          ← BACK
        </Link>
        <div className="text-sm tracking-widest justify-self-center">AQUISH</div>
        <div className="text-xs tracking-widest justify-self-end">CHECKOUT</div>
      </header>

      <div className="grid md:grid-cols-2 gap-0 max-w-6xl mx-auto">
        {/* Form */}
        <form
          onSubmit={onSubmit}
          className="p-6 md:p-10 flex flex-col gap-8 text-xs tracking-widest"
        >
          <Section title="CONTACT">
            <Field label="EMAIL" value={form.email} onChange={set("email")} type="email" required />
            <Field label="PHONE" value={form.phone} onChange={set("phone")} type="tel" />
          </Section>

          <Section title="SHIPPING">
            <div className="grid grid-cols-2 gap-3">
              <Field label="FIRST NAME" value={form.firstName} onChange={set("firstName")} required />
              <Field label="LAST NAME" value={form.lastName} onChange={set("lastName")} required />
            </div>
            <Field label="ADDRESS" value={form.address} onChange={set("address")} required />
            <Field label="APT / SUITE (OPTIONAL)" value={form.apt} onChange={set("apt")} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="CITY" value={form.city} onChange={set("city")} required />
              <Field label="REGION" value={form.region} onChange={set("region")} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="POSTAL CODE" value={form.postal} onChange={set("postal")} required />
              <Field label="COUNTRY" value={form.country} onChange={set("country")} required />
            </div>
          </Section>

          <Section title="PAYMENT">
            <div className="opacity-60">
              CARD DETAILS ARE ENTERED IN A SECURE PAYFAST WINDOW ON THIS PAGE.
            </div>
          </Section>

          <div className="flex flex-col items-center gap-2">
            <HCaptchaWidget onToken={setCaptchaToken} />
          </div>

          {error && <div className="text-xs">{error.toUpperCase()}</div>}

          <button
            type="submit"
            disabled={items.length === 0 || submitting}
            className="w-full py-4 text-xs tracking-widest disabled:opacity-40 aquish-btn-primary"
            style={{ background: "#000", color: "#fff", border: "none" }}
          >
            {submitting ? "PLACING ORDER…" : `PLACE ORDER${items.length > 0 ? ` (${fmtGbp(totalGbp)})` : ""}`}
          </button>
          {!user && (
            <div className="text-xs opacity-70">
              <Link to="/auth" className="underline underline-offset-4">SIGN IN</Link> TO PLACE AN ORDER
            </div>
          )}
        </form>

        {/* Summary */}
        <aside
          className="p-6 md:p-10 md:border-l text-xs tracking-widest"
          style={{ borderColor: "#000" }}
        >
          <div className="text-sm mb-4">ORDER</div>
          {items.length === 0 && <div className="opacity-60">BAG IS EMPTY</div>}
          <div className="flex flex-col">
            {items.map(({ i, b, p, c, parsed }) => (
              <div
                key={i}
                className="flex gap-3 py-3"
                style={{ borderBottom: "1px solid #000" }}
              >
                <div style={{ width: 64, height: 64, flexShrink: 0 }}>
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
                  <div className="opacity-70">
                    {c?.name} / {b.size} × {b.qty}
                  </div>
                  <div>
                    {parsed
                      ? currency.format(
                          `${parsed.code} ${(parsed.amount * b.qty).toFixed(2)}`,
                        )
                      : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {items.length > 0 && (
            <>
              <form onSubmit={applyCode} className="flex gap-2 pt-5">
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder="DISCOUNT CODE"
                  className="ai flex-1"
                  maxLength={64}
                />
                <button
                  type="submit"
                  className="px-4 aquish-btn-primary"
                  style={{ background: "#000", color: "#fff", border: "none" }}
                >
                  APPLY
                </button>
              </form>
              {codeStatus && <div className="opacity-70 pt-2">{codeStatus}</div>}

              <div className="flex flex-col gap-2 pt-5" style={{ borderTop: "1px solid #000", marginTop: 16 }}>
                <div className="flex justify-between pt-3">
                  <span>SUBTOTAL</span>
                  <span>{fmtGbp(subtotalGbp)}</span>
                </div>
                {applied && (
                  <div className="flex justify-between">
                    <span>DISCOUNT ({applied.code})</span>
                    <span>− {fmtGbp(discountGbp)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>SHIPPING</span>
                  <span>CALCULATED AT NEXT STEP</span>
                </div>
                <div className="flex justify-between pt-3 text-sm" style={{ borderTop: "1px solid #000" }}>
                  <span>TOTAL</span>
                  <span>{fmtGbp(totalGbp)}</span>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm" style={{ borderBottom: "1px solid #000", paddingBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="opacity-60 text-[10px]">{label}</span>
      <input {...rest} className="ai" />
    </label>
  );
}
