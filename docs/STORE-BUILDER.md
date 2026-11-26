# Store builder (Next 3)

**Admin → Online store** is where merchants decide how their store looks, much like Shopify's
theme editor.

## Themes

- **Theme library**: up to six themes per store. One is **live** (what shoppers see); the
  others are unpublished, for working on a new look.
- **Add a theme** from a preset:
  - **Foundry**: classic, serif headings, soft neutrals.
  - **Noor**: modest fashion. Warm stone, ivory, black and soft gold; Montserrat in capitals;
    portrait product rows; best sellers, shop by style, reviews, collection rows, a studio
    story, reasons to buy, icons and FAQ. Comes with sample products (below).
  - **Bazaar**: bold fashion look with a slideshow, uppercase headings, blush and gold.
  - **Minimal**: one typeface, lots of white space, pill buttons.
- Each theme can be **customized, previewed, renamed, duplicated and published**. A theme that
  isn't live can be deleted.
- **Sample products** (Noor): "Add sample products" on the theme adds 9 collections (Best
  sellers, New in, Black, Printed, Premium, Velvet and lace, Ready to wear, Dresses, Hijabs)
  and 25 products: abayas in 6 sizes × 5 lengths, dresses, hijabs. Each has two drawn pictures
  (full view and close-up), prices in the store's currency (rupees, converted for other
  currencies) and stock not tracked. Products are published and tagged `sample`. Banner
  pictures go into the theme's empty slideshow and story slots. Everything is original
  (names, copy, drawings); nothing is copied from another store.
  - It runs in steps of about 15 seconds (the admin repeats until done) and skips anything
    already there by handle, so it can be run again safely.
  - Code: `apps/api/src/online-store/sample/` (`noor-kit.ts` data, `art.ts` drawings).
- **Thumbnails**: the theme library shows a picture of each theme's home page.
  - **Your changes**: a few seconds after the editor saves (and once when a theme without a
    picture is opened), the editor opens the home page at desktop width in a hidden frame,
    the storefront photographs itself there (`modern-screenshot`, theme fonts embedded, no
    editor outlines or preview bars) and the picture is uploaded with
    `PUT /themes/:id/thumbnail`. The API re-encodes it (800 px WebP) and stores it by content;
    it doesn't count as an edit. Copies of a theme keep its picture.
  - **Before any change**: the preset's picture
    (`apps/admin/public/theme-previews/<preset>.webp`). After changing a preset, run
    `node scripts/theme-thumbnails.mjs` with the local stack running to make new ones. It
    photographs every preset in a "Lumen Studio" store filled with the sample products.
- Stores that never opened Online store show Foundry. It's saved as their live theme the first
  time Online store is opened.

## The editor (Customize)

A full-screen editor with three panels:

| Left                                                               | Middle                                          | Right                             |
| ------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------- |
| Sections of the page (header, page, footer), or **Theme settings** | The real store, showing the theme's saved draft | Settings for whatever is selected |

- **Pick the page to edit**:
  - Home page, Products, Collections and categories, Collections list, Cart, Search, Pages, 404.
  - The preview switches to that page, and moving around in the preview switches the list too.
- **Sections**:
  - Add, remove, drag to reorder (or use the arrows), hide or show, duplicate.
  - The page's own content (product details, product grid, cart…) is a fixed section that can't
    be removed.
- **Blocks** inside sections:
  - For example the slides of a slideshow, FAQ rows, footer columns, or the parts of the
    product information (title, price, variant picker, buy button, description, tabs…).
  - Add, reorder, hide, duplicate and remove them like sections.
- **Click to select**: clicking any part of the preview selects that section or block. The
  arrow-pointer button turns this off so links work.
- **Undo / redo**: buttons, or Ctrl/⌘+Z and Ctrl/⌘+Shift+Z. Up to 100 steps; typing in one
  field counts as one step.
- **Desktop / phone preview.**
- **Autosave**: changes save about a second after you stop. The status shows "All changes saved".
  Invalid values (a `javascript:` link, a missing image…) are highlighted and not saved.
- **Publish**: on the live theme it makes saved changes visible to shoppers. On another theme it
  makes that theme live.
- **Version history**: every publish keeps a version (the last 30). **Restore** brings one back.
  On the live theme it's published right away, so one click rolls the store back.

### Theme settings

- **Typography**: about 30 fonts, system or Google Fonts, including Urdu (Noto Nastaliq, Noto
  Naskh, Gulzar). Also text size, heading weight and letter case.
- **Layout**: page width and spacing between sections.
- **Buttons**: corner radius (up to pill shape), solid or outline.
- **Product cards**: image shape and fit, second image on hover, vendor, "Sale" badge.
- **Colors** (listed first):
  - **Brand color**: one primary color drives the store. Buttons, links, badges and highlights
    use it, and the three main color schemes are built from it:
    - **Light**: white with brand-colored buttons;
    - **Soft**: a light tint of the brand;
    - **Brand**: filled with the brand color.
  - Any brand color stays readable: text and button-text colors are adjusted until they meet
    WCAG AA (4.5:1).
  - To pick every color yourself, turn off "Build color schemes from the brand color", or edit a
    main scheme (which turns it off). Up to 8 schemes; the editor warns about low contrast.
  - Themes saved before brand colors keep their own schemes.
  - Also the sale color.
- **Logo and favicon**: the logo is set in the Header section.
- **Social media**: Instagram, Facebook, TikTok, YouTube, X and WhatsApp links, shown in the
  footer.

### Sections

| Group          | Sections                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Header         | Announcement bar (rotating messages), Header (logo, menu, centered or left layout, sticky, search)                          |
| Footer         | Footer (store information, menu columns, text, social icons, country selector, copyright)                                   |
| Banners        | Image banner (image, mobile image, overlay, content position, heading / text / buttons), Slideshow, Text banner             |
| Products       | Featured collection, Featured products, New arrivals, Collection list, Category list, Related products (product pages)      |
| Text           | Rich text, Image with text, Multicolumn, Icons with text (e.g. "Cash on delivery"), Testimonials, Collapsible content (FAQ) |
| Media / layout | Video (YouTube or Vimeo), Spacer                                                                                            |

## Pages and navigation

- **Pages** (`/pages/:handle`):
  - About us, Contact, policies and so on, with templates to start from (About, Contact,
    Shipping, Returns, Privacy, Terms).
  - Hidden pages only show in theme previews.
  - Pages are listed in the sitemap.
- **Navigation**: menus with up to three levels (dropdowns in the header).
  - Items link to the home page, all products, all collections, search, a collection, category,
    product or page, or any `/path` or `https://` address.
  - Links point at items by id, so renaming a handle never breaks a menu. Items whose target is
    deleted or hidden are left out of the store.
  - The **Main menu** and **Footer menu** are created the first time Navigation is opened. The
    header and footer pick a menu in the editor.

## Safety

- Themes can only contain the registered sections and blocks. Every setting has a type:
  - hex colors, choices from a list, bounded numbers and plain text;
  - links that are a store path or `https://`;
  - images from the store's own media library;
  - YouTube or Vimeo videos.
- Rich text is cleaned against an allow-list when saved. There is no code editor and no custom
  CSS. Nothing a merchant enters is run.
- The API validates every save strictly. The storefront renders leniently: a bad value falls back
  to its default and never breaks the page.
- Draft previews use a signed token that expires after 1 hour. The storefront keeps it in a
  `SameSite=None; Secure; Partitioned` cookie so it also works inside the editor's frame when the
  store has its own domain. Previews are never cached and are marked `noindex`.
- The storefront allows framing by itself and by `ADMIN_URL` (Content-Security-Policy
  `frame-ancestors`).

## Data and API

- `themes`: name, preset, role (`live` or `unpublished`; one live per store), `data` (the
  editor's draft) and `live_data` (published).
- `theme_versions`: what each publish looked like.
- `menus`, `pages`.
- Endpoints are in `API.md` under "Store builder". Theme content is described by
  `@cartforge/theme-engine` (`SECTION_DEFS`, `GLOBAL_SETTINGS`, `validateTheme`).

## Round 2

### Custom CSS

- Every section has **Advanced → Custom CSS**. **Theme settings → Custom CSS** applies to the
  whole store.
- A section's CSS only affects that section: every selector is prefixed with the section. Use
  `:scope` for the section itself, e.g. `:scope { padding-top: 0 }`.
- `@media`, `@supports`, `@container` and `@keyframes` work.
- For safety these are refused with a message, and the CSS isn't saved:
  - `url(…)`, `image-set(…)`, `@import`, `@font-face`, `@charset`;
  - `expression(…)`, `behavior`, `-moz-binding`, `javascript:`;
  - backslash escapes and `<`;
  - unclosed braces or comments.
- At most 5,000 characters per box.

### Dynamic values

- Text, multi-line text and rich text settings can contain placeholders that are filled in for
  the page being shown. The **{ }** button next to a field inserts them.

  | Page                       | Placeholders                                                                                                                     |
  | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
  | Products                   | `{{ product.title }}`, `{{ product.vendor }}`, `{{ product.price }}`, `{{ product.compare_at_price }}`, `{{ product.category }}` |
  | Collections and categories | `{{ collection.title }}`, `{{ collection.product_count }}`                                                                       |
  | Pages                      | `{{ page.title }}`                                                                                                               |
  | Search                     | `{{ search.terms }}`                                                                                                             |
  | Blogs and blog posts       | `{{ blog.title }}`, `{{ article.title }}`, `{{ article.author }}`, `{{ article.date }}`                                          |
  | Everywhere                 | `{{ store.name }}`                                                                                                               |

- Values are plain text: they're HTML-escaped in rich text, and unknown placeholders become empty.

### Alternate templates

- Products, collections and pages can have extra layouts, e.g. **Products: bridal**.
- In the editor, use the page picker → **Create a … template** (it starts as a copy of the
  default). The trash button next to the picker deletes the template being edited.
- Choose one on a product, collection or page under **Theme template**. Only templates in the
  live theme (draft or published) can be chosen.
- A missing template falls back to the default. In the editor's preview, `?view=<name>` shows an
  alternate.
- Up to 10 per kind. Names use lowercase letters, numbers and hyphens.

### Blog

- **Online store → Blog posts**.
  - A **News** blog is created the first time you open it. **Manage blogs** adds, renames or
    deletes blogs; deleting a blog deletes its posts.
- Each post has: title, content, excerpt, featured image (from the media library), author, tags,
  a published switch with a publish date (a future date schedules it), SEO fields and a handle.
- On the store:
  - `/blogs/<blog>`: posts newest first, filter by tag, paginated;
  - `/blogs/<blog>/<post>`: the post, with JSON-LD `BlogPosting` and share links;
  - drafts and scheduled posts only show in theme previews.
- The theme has **Blogs** and **Blog posts** templates (layout, image, date, author, excerpt, tags,
  share). The **Blog posts** section shows the latest posts on any page.
- Menus can link to a blog, and blogs and posts are in the sitemap.

## Build your own

### Custom section

- **Add section → Build your own → Custom section**: a section you lay out yourself.
- **Section settings:**
  - 1–4 columns; for 2 columns the widths can be equal, 2:1 or 1:2;
  - vertical alignment, gap, width (narrow, page or full) and space above and below;
  - "On phones, show the last column first";
  - a background image with overlay, and a color scheme.
- **Blocks** (up to 30): heading (four sizes), text, image (link, rounded, max width), buttons,
  video, icon with text, product card, collection card, countdown timer, embed, divider, spacer.
- Every block has a **column**, an **alignment** and **Show on** (all screens, desktop only or
  phones only).
- The countdown counts down to a date and time. When it ends it shows a message, or hides.

### Embed section

- **Add section → Build your own → Embed**: paste a link, not embed code.
- Supported: YouTube, Vimeo, Google Maps (a place link or the "Embed a map" address), Instagram
  posts and reels, TikTok videos, Facebook pages, posts and videos, Google Forms, Typeform,
  Spotify and SoundCloud.
- The link is turned into the provider's own embed address. Anything else is refused, so a
  section can never load an arbitrary page or script.
- The same links work in the Custom section's Embed block.

### Custom code

- **Add section → Build your own → Custom code** has exactly two boxes: **Code** (HTML) and
  **CSS**. Tab indents; press Esc and then Tab to leave a box.
- **HTML without scripts** is shown on the page, cleaned against an allow-list:
  - **kept:** layout and text tags, links, images (https), `<picture>`, `<video>`, tables,
    `<details>`, simple SVG, and frames from known video and map providers;
  - **removed:** scripts, event handlers, forms, and other frames.
  - Inline `style` attributes are kept when they pass the Custom CSS check.
- **Code with scripts** (or `on…=` handlers, `javascript:`, or form fields) runs in a sandboxed
  frame on the page.
  - The frame has no access to the store's cookies, storage or page, and gets the theme's colors
    and fonts.
  - It resizes to fit its content. Links in it open the store's pages when clicked.
  - This keeps shoppers and staff safe on a shared platform where the admin and the stores can be
    on one address.
- **CSS**:
  - scoped to the section (`:scope` is the section itself) when the HTML is on the page, and
    unscoped inside the frame;
  - `url(https://…)` images and `@font-face` fonts are allowed;
  - `@import`, `http:` links, `javascript:`, escapes and `<` are refused;
  - up to 20,000 characters, and 50,000 for the code.

### Saved sections

- Select a section and click the **bookmark** button (Save section to reuse), then give it a name.
- **Add section → Saved sections** adds a copy to any page, in any theme.
- Copies are independent: editing one doesn't change the others or the saved version.
- Up to 50 saved sections. A saved section is checked like a theme save: header, footer and a
  page's main section can't be saved.
- Delete a saved section with the trash icon in Add section.

## Not yet

- Translations (with a Markets language setting).
- App blocks (needs the developer platform).
- Metafields as dynamic sources.
