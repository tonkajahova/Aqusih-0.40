import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useStore, loadFromCloud } from "@/lib/store";
import { useCurrency } from "@/lib/currency";
import { QuickView } from "./index";

export const Route = createFileRoute("/product/$sku")({
  head: ({ params }) => ({
    meta: [
      { title: `AQUISH — ${params.sku}` },
      { name: "description", content: `AQUISH product ${params.sku}.` },
      { property: "og:title", content: `AQUISH — ${params.sku}` },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { sku } = Route.useParams();
  const navigate = useNavigate();
  const products = useStore((s) => s.products);
  const currency = useCurrency();

  useEffect(() => { loadFromCloud(); }, []);

  const list = products.filter((p) => p.status === "published");
  const idx = list.findIndex((p) => p.sku === sku);
  const product = idx >= 0 ? list[idx] : null;

  if (!product) {
    return (
      <div className="min-h-screen aquish-bg flex flex-col items-center justify-center gap-4 tracking-widest">
        <div>PRODUCT NOT FOUND</div>
        <Link to="/" className="aquish-link underline">RETURN HOME</Link>
      </div>
    );
  }

  const go = (i: number) => {
    const next = list[(i + list.length) % list.length];
    navigate({ to: "/product/$sku", params: { sku: next.sku } });
  };

  return (
    <QuickView
      product={product}
      onClose={() => navigate({ to: "/" })}
      onPrevProduct={list.length > 1 ? () => go(idx - 1) : undefined}
      onNextProduct={list.length > 1 ? () => go(idx + 1) : undefined}
      currency={currency}
    />
  );
}

