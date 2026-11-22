import Link from "next/link";
import { mainSection, TemplateSections } from "@/components/theme/render";

export default async function NotFound() {
  const main = await mainSection("not_found").catch(() => undefined);
  const s = main?.settings ?? {};
  const heading = typeof s.heading === "string" && s.heading ? s.heading : "Page not found";
  const text =
    typeof s.text === "string" && s.text
      ? s.text
      : "The page you’re looking for doesn’t exist or is no longer available.";
  return (
    <TemplateSections
      template="not_found"
      main={() => (
        <div className="sf-container flex flex-col items-center py-24 text-center">
          <p className="text-sm uppercase tracking-wider text-muted">404</p>
          <h1 className="mt-3 text-3xl md:text-5xl">{heading}</h1>
          <p className="mt-4 max-w-md text-muted">{text}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/products" className="sf-button">
              Browse products
            </Link>
            <Link href="/" className="sf-button" data-variant="outline">
              Go home
            </Link>
          </div>
        </div>
      )}
    />
  );
}
