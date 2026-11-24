import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { newSection } from "@cartforge/theme-engine";
import { api, createTestApp, login, RUN } from "./app";
import { TEST_ENV } from "./test-env";

/** Store builder: theme library, draft → publish → roll back, previews, menus and pages. */
describe("online store", () => {
  let app: INestApplication;
  let edition: string | undefined;
  let owner: ReturnType<typeof api>;
  let storeId = "";
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  const http = () => request(app.getHttpServer());
  const sf = (path: string, preview?: string) => {
    const r = http().get(`/api/v1/storefront${path}`).set("X-Store-Id", storeId);
    return preview ? r.set("X-Theme-Preview", preview) : r;
  };

  beforeAll(async () => {
    edition = process.env.CARTFORGE_EDITION;
    process.env.CARTFORGE_EDITION = "saas";
    app = await createTestApp();
    const merchant = await login(app, "other@cartforge.test");
    storeId = (
      await http()
        .post("/api/v1/stores")
        .set("Cookie", merchant.cookies)
        .set("X-CSRF-Token", merchant.csrf)
        .send({ store_name: `Builder ${RUN}`, currency: "PKR" })
        .expect(201)
    ).body.data.store_id;
    owner = api(app, merchant, storeId);
  });

  afterAll(async () => {
    if (edition === undefined) delete process.env.CARTFORGE_EDITION;
    else process.env.CARTFORGE_EDITION = edition;
    await prisma.$disconnect();
    await app.close();
  });

  let live = "";
  it("a new store renders the default theme and gets a live Foundry theme on first visit", async () => {
    const before = (await sf("/theme").expect(200)).body.data;
    expect(before).toMatchObject({ theme_id: null, preview: false });
    expect(before.data.templates.home.length).toBeGreaterThan(0);
    expect(before.menus["main-menu"][0]).toEqual({
      title: "Shop all",
      url: "/products",
      children: [],
    });

    const list = (await owner.get("/themes").expect(200)).body.data;
    expect(list).toEqual([
      expect.objectContaining({ name: "Foundry", role: "live", has_unpublished_changes: false }),
    ]);
    live = list[0].id;
    const presets = (await owner.get("/themes/presets").expect(200)).body.data;
    expect(presets.map((p: { key: string }) => p.key)).toEqual(["foundry", "bazaar", "minimal"]);
  });

  it("saves drafts strictly; shoppers see changes only after publishing", async () => {
    const theme = (await owner.get(`/themes/${live}`).expect(200)).body.data;
    const data = theme.data;
    // Invalid values are refused with paths.
    const bad = structuredClone(data);
    bad.templates.home[0].settings.button_link = "javascript:alert(1)";
    const refused = await owner.put(`/themes/${live}/data`, { data: bad }).expect(422);
    expect(refused.body.error.fields[0].path).toBe("data.templates.home.0.settings.button_link");

    const banner = newSection("rich_text");
    banner.blocks[1]!.settings.text =
      '<p onclick="x()">Hello <script>alert(1)</script><strong>Eid</strong></p>';
    data.templates.home.unshift(banner);
    data.settings.heading_font = "playfair";
    const saved = (await owner.put(`/themes/${live}/data`, { data }).expect(200)).body.data;
    expect(saved.contrast).toEqual({});
    const after = (await owner.get(`/themes/${live}`).expect(200)).body.data;
    expect(after.has_unpublished_changes).toBe(true);
    expect(after.data.templates.home[0].blocks[1].settings.text).toBe(
      "<p>Hello <strong>Eid</strong></p>",
    );

    // Shoppers still see the published theme…
    const shopper = (await sf("/theme").expect(200)).body.data;
    expect(shopper.data.settings.heading_font).toBe("serif");
    // …a preview token shows the draft.
    const { token } = (await owner.post(`/themes/${live}/preview-link`, {}).expect(200)).body.data;
    const previewed = await sf("/theme", token).expect(200);
    expect(previewed.headers["cache-control"]).toBe("private, no-store");
    expect(previewed.body.data).toMatchObject({ preview: true, theme_id: live });
    expect(previewed.body.data.data.settings.heading_font).toBe("playfair");
    // A token for another store is ignored.
    expect((await sf("/theme", `${token}x`).expect(200)).body.data.preview).toBe(false);

    await owner.post(`/themes/${live}/publish`, {}).expect(200);
    expect((await sf("/theme").expect(200)).body.data.data.settings.heading_font).toBe("playfair");
  });

  it("keeps versions and rolls back", async () => {
    const t = (await owner.get(`/themes/${live}`).expect(200)).body.data;
    t.data.settings.heading_font = "inter";
    await owner.put(`/themes/${live}/data`, { data: t.data }).expect(200);
    await owner.post(`/themes/${live}/publish`, {}).expect(200);
    const versions = (await owner.get(`/themes/${live}/versions`).expect(200)).body.data;
    expect(versions).toHaveLength(2);
    expect(versions[0].created_by).toBeTruthy();
    await owner.post(`/themes/${live}/versions/${versions[1].id}/restore`, {}).expect(200);
    expect((await sf("/theme").expect(200)).body.data.data.settings.heading_font).toBe("playfair");
    expect((await owner.get(`/themes/${live}/versions`).expect(200)).body.data).toHaveLength(3);

    // Discarding unpublished edits.
    const d = (await owner.get(`/themes/${live}`).expect(200)).body.data;
    d.data.settings.body_font = "mono";
    await owner.put(`/themes/${live}/data`, { data: d.data }).expect(200);
    await owner.post(`/themes/${live}/discard`, {}).expect(200);
    expect((await owner.get(`/themes/${live}`).expect(200)).body.data).toMatchObject({
      has_unpublished_changes: false,
    });
  });

  it("theme library: add, duplicate, rename, publish another, protect the live one", async () => {
    const bazaar = (await owner.post("/themes", { preset: "bazaar" }).expect(201)).body.data;
    expect(bazaar).toMatchObject({ name: "Bazaar", role: "unpublished" });
    await owner.post("/themes", { preset: "nope" }).expect(422);
    const copy = (await owner.post(`/themes/${bazaar.id}/duplicate`, {}).expect(201)).body.data;
    expect(copy.name).toBe("Copy of Bazaar");
    await owner.patch(`/themes/${copy.id}`, { name: "Eid look" }).expect(200);
    await owner.delete(`/themes/${live}`).expect(409);

    await owner.post(`/themes/${bazaar.id}/publish`, {}).expect(200);
    const list = (await owner.get("/themes").expect(200)).body.data as {
      id: string;
      role: string;
    }[];
    expect(list.find((t) => t.role === "live")!.id).toBe(bazaar.id);
    expect(list.filter((t) => t.role === "live")).toHaveLength(1);
    const shopper = (await sf("/theme").expect(200)).body.data;
    expect(shopper.theme_id).toBe(bazaar.id);
    expect(shopper.data.settings.heading_font).toBe("montserrat");
    await owner.delete(`/themes/${copy.id}`).expect(204);
    await owner.delete(`/themes/${live}`).expect(204); // no longer live

    // Up to six themes.
    for (let i = (await owner.get("/themes").expect(200)).body.data.length; i < 6; i++)
      await owner.post("/themes", { preset: "minimal" }).expect(201);
    expect((await owner.post("/themes", { preset: "minimal" }).expect(409)).body.error.code).toBe(
      "THEME_LIMIT",
    );
  });

  it("menus link by id and resolve to current URLs; missing targets are left out", async () => {
    const menus = (await owner.get("/menus").expect(200)).body.data;
    expect(menus.map((m: { handle: string }) => m.handle)).toEqual(["main-menu", "footer"]);
    const col = (
      await owner.post("/collections", { title: `Lawn ${RUN}`, status: "active" }).expect(201)
    ).body.data;
    const page = (
      await owner
        .post("/pages", {
          title: "About us",
          body_html: "<p>We <em>sew</em>.</p><img src=x onerror=y>",
        })
        .expect(201)
    ).body.data;
    expect(page).toMatchObject({ handle: "about-us", body_html: "<p>We <em>sew</em>.</p>" });
    const main = menus[0];
    const saved = (
      await owner
        .put(`/menus/${main.id}`, {
          title: "Main menu",
          items: [
            {
              id: "a",
              title: "Lawn",
              link: { type: "collection", id: col.id },
              children: [{ id: "a1", title: "About", link: { type: "page", id: page.id } }],
            },
            {
              id: "b",
              title: "Gone",
              link: { type: "product", id: "00000000-0000-4000-8000-00000000dead" },
            },
            {
              id: "c",
              title: "WhatsApp",
              link: { type: "url", url: "https://wa.me/923001234567" },
            },
          ],
        })
        .expect(200)
    ).body.data;
    expect(saved.items).toHaveLength(3);
    await owner
      .put(`/menus/${main.id}`, {
        title: "Main",
        items: [{ id: "x", title: "Bad", link: { type: "url", url: "javascript:alert(1)" } }],
      })
      .expect(422);
    const shopper = (await sf("/theme").expect(200)).body.data;
    expect(shopper.menus["main-menu"]).toEqual([
      {
        title: "Lawn",
        url: `/collections/${col.handle}`,
        children: [{ title: "About", url: "/pages/about-us", children: [] }],
      },
      { title: "WhatsApp", url: "https://wa.me/923001234567", children: [] },
    ]);
  });

  it("pages: published ones are public; drafts only in previews", async () => {
    const draft = (
      await owner
        .post("/pages", { title: "Returns policy", body_html: "<p>7 days.</p>", published: false })
        .expect(201)
    ).body.data;
    const dup = (await owner.post("/pages", { title: "About us" }).expect(201)).body.data;
    expect(dup.handle).toBe("about-us-2");
    await sf("/pages/returns-policy").expect(404);
    const themes = (await owner.get("/themes").expect(200)).body.data;
    const { token } = (await owner.post(`/themes/${themes[0].id}/preview-link`, {}).expect(200))
      .body.data;
    expect((await sf("/pages/returns-policy", token).expect(200)).body.data.title).toBe(
      "Returns policy",
    );
    const about = (await sf("/pages/about-us").expect(200)).body.data;
    expect(about).toMatchObject({
      title: "About us",
      seo: { title: "About us", description: "We sew." },
    });
    expect(
      (await sf("/pages").expect(200)).body.data.map((p: { handle: string }) => p.handle),
    ).toEqual(["about-us", "about-us-2"]);
    await owner.put(`/pages/${draft.id}`, { title: "Returns", handle: "about-us" }).expect(422);
  });

  it("theme images must be the store's own media; others are dropped when served", async () => {
    const t = (await owner.get("/themes").expect(200)).body.data.find(
      (x: { role: string }) => x.role === "live",
    );
    const d = (await owner.get(`/themes/${t.id}`).expect(200)).body.data;
    const header = d.data.groups.header.find((s: { type: string }) => s.type === "header");
    header.settings.logo = "0b6f3c9e-1d7a-4c55-9a2b-6d1b0c8e7f10";
    await owner.put(`/themes/${t.id}/data`, { data: d.data }).expect(200);
    await owner.post(`/themes/${t.id}/publish`, {}).expect(200);
    expect((await sf("/theme").expect(200)).body.data.images).toEqual({});
  });

  it("custom CSS is checked when saving", async () => {
    const t = (await owner.get("/themes").expect(200)).body.data.find((x: { role: string }) => x.role === "live");
    const d = (await owner.get(`/themes/${t.id}`).expect(200)).body.data;
    d.data.templates.home[0].settings.custom_css = "</style><script>alert(1)</script>";
    const r = await owner.put(`/themes/${t.id}/data`, { data: d.data }).expect(422);
    expect(r.body.error.fields[0].path).toBe("data.templates.home.0.settings.custom_css");
    d.data.templates.home[0].settings.custom_css = "h2 { letter-spacing: 0.1em }";
    await owner.put(`/themes/${t.id}/data`, { data: d.data }).expect(200);
  });

  it("alternate templates: create in the theme, assign to a product, storefront sees it", async () => {
    const t = (await owner.get("/themes").expect(200)).body.data.find((x: { role: string }) => x.role === "live");
    const d = (await owner.get(`/themes/${t.id}`).expect(200)).body.data;
    d.data.alternates.product.bridal = [newSection("main_product"), newSection("faq")];
    await owner.put(`/themes/${t.id}/data`, { data: d.data }).expect(200);
    expect((await owner.get("/theme-templates").expect(200)).body.data.product).toEqual(["bridal"]);

    const p = (
      await owner.post("/products", { title: `Bridal ${RUN}`, price_minor: 90000, status: "active" }).expect(201)
    ).body.data;
    await owner.put(`/theme-templates/product/${p.id}`, { template: "nope" }).expect(422);
    expect(
      (await owner.put(`/theme-templates/product/${p.id}`, { template: "bridal" }).expect(200)).body.data,
    ).toEqual({ template: "bridal", available: ["bridal"] });
    expect((await sf(`/products/${p.handle}`).expect(200)).body.data.template_suffix).toBe("bridal");
    await owner.put(`/theme-templates/product/${p.id}`, { template: null }).expect(200);
    await owner.put(`/theme-templates/widget/${p.id}`, { template: null }).expect(404);
  });

  it("blog: a News blog, posts with drafts and scheduling, storefront and menu links", async () => {
    const blogs = (await owner.get("/blogs").expect(200)).body.data;
    expect(blogs).toEqual([expect.objectContaining({ handle: "news", title: "News", article_count: 0 })]);
    const news = blogs[0].id;
    const style = (await owner.post("/blogs", { title: "Style guide" }).expect(201)).body.data;
    expect(style.handle).toBe("style-guide");

    const post = (
      await owner
        .post("/articles", {
          blog_id: news,
          title: "Eid styling tips",
          body_html: "<p>Pair <strong>lawn</strong> with chiffon.</p><script>x</script>",
          tags: ["eid", "lawn", "eid"],
          author: "Sana",
          published: true,
        })
        .expect(201)
    ).body.data;
    expect(post).toMatchObject({
      handle: "eid-styling-tips",
      body_html: "<p>Pair <strong>lawn</strong> with chiffon.</p>",
      tags: ["eid", "lawn"],
      published: true,
    });
    expect(post.published_at).toBeTruthy();
    await owner.post("/articles", { blog_id: news, title: "Coming soon", published: false }).expect(201);
    await owner
      .post("/articles", {
        blog_id: news,
        title: "Next week",
        published: true,
        published_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .expect(201);

    const blog = (await sf("/blogs/news").expect(200)).body.data;
    expect(blog.articles.map((a: { title: string }) => a.title)).toEqual(["Eid styling tips"]);
    expect(blog.tags).toEqual(["eid", "lawn"]);
    expect(blog.articles[0].excerpt).toBe("Pair lawn with chiffon.");
    expect((await sf("/blogs/news?tag=lawn").expect(200)).body.data.meta.total).toBe(1);
    expect((await sf("/blogs/news/eid-styling-tips").expect(200)).body.data).toMatchObject({
      blog_title: "News",
      author: "Sana",
      seo: { title: "Eid styling tips", description: "Pair lawn with chiffon." },
    });
    await sf("/blogs/news/coming-soon").expect(404);
    const { token } = (
      await owner.post(`/themes/${(await owner.get("/themes").expect(200)).body.data[0].id}/preview-link`, {}).expect(200)
    ).body.data;
    expect((await sf("/blogs/news/coming-soon", token).expect(200)).body.data.title).toBe("Coming soon");
    expect((await sf("/blogs").expect(200)).body.data.find((b: { handle: string }) => b.handle === "news").articles).toHaveLength(1);

    const menus = (await owner.get("/menus").expect(200)).body.data;
    await owner
      .put(`/menus/${menus[1].id}`, {
        title: "Footer",
        items: [{ id: "blog", title: "Journal", link: { type: "blog", id: style.id } }],
      })
      .expect(200);
    expect((await sf("/theme").expect(200)).body.data.menus.footer).toEqual([
      { title: "Journal", url: "/blogs/style-guide", children: [] },
    ]);

    // Deleting a blog deletes its posts.
    await owner.delete(`/blogs/${style.id}`).expect(204);
    await sf("/blogs/style-guide").expect(404);
  });
});
