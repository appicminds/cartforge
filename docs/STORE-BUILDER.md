# Store builder (Next 3)

**Admin → Online store** is where merchants decide how their store looks, much like Shopify's
theme editor.

## Themes

- **Theme library**: up to six themes per store. One is **live** (what shoppers see); the
  others are unpublished, for working on a new look.
- **Add a theme** from a preset:
  - **Foundry**: classic, serif headings, soft neutrals.
  - **Bazaar**: bold fashion look with a slideshow, uppercase headings, blush and gold.
  - **Minimal**: one typeface, lots of white space, pill buttons.
- Each theme can be **customized, previewed, renamed, duplicated and published**. A theme that
  isn't live can be deleted.
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

## Not yet (Round 2)

- Alternate templates (a different product layout for some products).
- Blog and articles.
- Custom CSS per section.
- Dynamic sources (fill settings from product fields or metafields).
- Translations.
- App blocks (needs the developer platform).
