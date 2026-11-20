import { priceView } from "@/lib/money";

export function Price({
  product,
  currency,
  locale,
  size = "md",
}: {
  product: {
    price_min_minor: number | null;
    price_max_minor: number | null;
    compare_at_min_minor: number | null;
  };
  currency: string;
  locale?: string;
  size?: "md" | "lg";
}) {
  const p = priceView(product, currency, locale);
  if (!p) return <p className="text-muted">Price on request</p>;
  return (
    <p className={size === "lg" ? "text-xl" : "text-[0.95rem]"}>
      {p.compareAt ? (
        <>
          <span className="sr-only">Sale price </span>
          <span className="font-semibold text-sale">{p.label}</span>{" "}
          <span className="sr-only">Regular price </span>
          <s className="text-muted">{p.compareAt}</s>
        </>
      ) : (
        <span>{p.label}</span>
      )}
    </p>
  );
}
