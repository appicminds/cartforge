import type { Metadata, Viewport } from "next";
import { defaultTheme, themeCss } from "@cartforge/theme-engine";
import { cookies, headers } from "next/headers";
import { NO_STORE_HEADER, PREVIEW_HEADER } from "@/lib/site-headers";
import { PreviewBar } from "@/components/preview-bar";
import { EditorBridge } from "@/components/theme/editor-bridge";
import { GroupSections } from "@/components/theme/render";
import { CART_COUNT_COOKIE } from "@/lib/commerce";
import { storefront } from "@/lib/api";
import { site } from "@/lib/config";
import { getTheme } from "@/lib/theme";
import "./globals.css";

/**
 * Pages render per request; the API data they read is served from Next's data
 * cache under the "catalog" tag, which the API purges on every catalog write.
 * This keeps builds independent of the API and output fresh after edits.
 */
export const dynamic = "force-dynamic";

/** Hosts that belong to no store get a bare page: no store data is loaded at all. */
async function noStore(): Promise<boolean> {
  return (await headers()).get(NO_STORE_HEADER) === "1";
}

/** A store without a domain, previewed on the shared address (`/?store=<handle>`). */
async function previewing(): Promise<boolean> {
  return (await headers()).get(PREVIEW_HEADER) === "1";
}

export async function generateMetadata(): Promise<Metadata> {
  if (await noStore()) return { title: "Store not found", robots: { index: false, follow: false } };
  const [store, { siteUrl }, preview, theme] = await Promise.all([
    storefront.store(),
    site(),
    previewing(),
    getTheme(),
  ]);
  const fav = theme.images[String(theme.data.settings.favicon ?? "")];
  return {
    ...((preview || theme.preview) && { robots: { index: false, follow: false } }),
    ...(fav && { icons: { icon: fav.medium_url ?? fav.url } }),
    metadataBase: new URL(siteUrl),
    title: { default: store.name, template: `%s | ${store.name}` },
    description: `Shop ${store.name} online.`,
    openGraph: { siteName: store.name, type: "website" },
    formatDetection: { telephone: false },
  };
}

export async function generateViewport(): Promise<Viewport> {
  if (await noStore()) return { themeColor: "#ffffff" };
  return { themeColor: (await getTheme()).data.color_schemes[0]!.background };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  if (await noStore()) {
    return (
      <html lang="en">
        <head>
          <style dangerouslySetInnerHTML={{ __html: themeCss(defaultTheme()) }} />
        </head>
        <body>
          <main id="main">{children}</main>
        </body>
      </html>
    );
  }
  const [store, jar, preview, theme] = await Promise.all([
    storefront.store(),
    cookies(),
    previewing(),
    getTheme(),
  ]);
  const cartCount = Math.max(0, Number.parseInt(jar.get(CART_COUNT_COOKIE)?.value ?? "0", 10) || 0);
  return (
    <html lang={store.locale}>
      <head>
        {/* Validated, enum/hex-only values (see @cartforge/theme-engine). */}
        <style dangerouslySetInnerHTML={{ __html: theme.css }} />
        {theme.fontsUrl && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            <link rel="stylesheet" href={theme.fontsUrl} />
          </>
        )}
      </head>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-bg focus:px-4 focus:py-2 focus:shadow"
        >
          Skip to content
        </a>
        {preview && <PreviewBar storeName={store.name} />}
        {theme.preview && <EditorBridge />}
        <GroupSections group="header" cartCount={cartCount} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <GroupSections group="footer" />
      </body>
    </html>
  );
}
