import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL, legalBySlug } from "@/lib/legal";

export const dynamicParams = false;
export const generateStaticParams = () => LEGAL.map((d) => ({ doc: d.slug }));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const d = legalBySlug((await params).doc);
  return d
    ? { title: d.title, description: d.description, alternates: { canonical: `/legal/${d.slug}` } }
    : {};
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const d = legalBySlug((await params).doc);
  if (!d) notFound();
  return (
    <div className="container-x grid gap-12 py-16 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Legal" className="lg:sticky lg:top-24 lg:self-start">
        <ul className="flex flex-wrap gap-2 lg:flex-col">
          {LEGAL.map((x) => (
            <li key={x.slug}>
              <Link
                href={`/legal/${x.slug}`}
                aria-current={x.slug === d.slug ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm font-medium ${x.slug === d.slug ? "bg-paper-2 text-fg" : "text-fg-muted hover:text-fg"}`}
              >
                {x.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <article className="max-w-[68ch]">
        <h1 className="text-4xl font-semibold sm:text-5xl">{d.title}</h1>
        <p className="mt-3 text-sm text-fg-muted">Last updated {d.updated}</p>
        <p className="mt-6 text-lg text-fg-muted">{d.description}</p>
        {d.sections.map((s) => (
          <section key={s.heading} className="mt-10">
            <h2 className="text-2xl font-semibold">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mt-3 leading-relaxed text-fg-muted">
                {p}
              </p>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
