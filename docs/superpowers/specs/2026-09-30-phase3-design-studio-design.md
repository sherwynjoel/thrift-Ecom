# Phase 3 — Custom Design Studio and Print Queue Design

Status: approved direction (Phase 1 spec table: "Designer (Phase 3): upload image, custom text, front and back, shirt style and color, 2D canvas preview"; owner wants customers to upload designs and see them on the T-shirt, printed in-house). Builds on Phase 1 and Phase 2 specs; all conventions bind (paise, services own `@/server/db`, mobile-first, reduced motion respected, admin guard).

## 1. Scope

A `/customize` Design Studio (replacing the placeholder) where a customer picks a customizable product (`isCustomizable = true`), color and size, designs the front and back with uploaded images and text on a 2D canvas over a shirt mockup, sees the price update, and adds the custom shirt to the cart. Designs are saved server-side with preview images and print-resolution files. Checkout, orders and emails carry the design through. Admin gets a Print Queue to produce custom items, and order pages show design previews and print-file downloads.

Out of scope: 3D preview, AI generation, templates marketplace, embroidery.

## 2. Decisions

| Topic | Decision |
|---|---|
| Canvas library | `fabric` v6 (only new runtime dependency), loaded client-side only via dynamic import in the studio route. |
| Mockup | Pure SVG T-shirt silhouettes (front and back) in `src/components/studio/shirt-svg.tsx`, filled with the selected variant color hex, with subtle shading overlays. No photo assets needed; works for every color. Print area: front 12in × 16in, back 12in × 16in, drawn as a dashed guide at a fixed position relative to the SVG viewBox. |
| Objects | Uploaded image (PNG/JPEG/WebP ≤ 10 MB, stored via existing storage adapter under `designs/assets/`), text (4 bundled fonts already in the app or Google fonts loaded via next/font: Anton, Bebas Neue, Inter, Permanent Marker; color, size, bold/italic, alignment, letter spacing, curved text out of scope). Move, scale, rotate, delete, duplicate, bring forward/backward, center, undo/redo (20 steps). Objects are clipped to the print area. |
| Low-resolution warning | If an image's effective DPI at its printed size < 150 → amber warning chip; < 100 → red "may print blurry". Never blocks. |
| Rights | A required checkbox "I own the rights to this artwork" before adding to cart; stored on the design. |
| Save | On "Add to cart", the client exports: canvas JSON per side, preview PNG per side (mockup + design, 800 px wide), print PNG per side (transparent, print area only, 3600 × 4800 px = 300 DPI at 12 × 16 in). Uploaded to `POST /api/designs` (multipart, rate limited, ≤ 30 MB total). Empty sides produce no files. |
| Pricing | Unit price = variant price + `customFrontFeePaise` (if front has objects) + `customBackFeePaise` (if back has objects). Fees live in `StoreSetting` (defaults 0 and 14900). Pricing engine treats custom lines like any other line; offers apply only if `offer.includeCustom` (default false). |
| Ownership | A design belongs to the user (if signed in) or to the guest cart token; it moves to the user on cart merge. Designs are immutable once added to a cart; editing makes a new design ("Edit design" loads its JSON into the studio). |
| Cart | `CartItem.designId` nullable. The `(cartId, variantId)` unique rule is replaced by service-level uniqueness on (cartId, variantId, designId-or-null) with a partial unique index for null designs and a unique index on (cartId, designId). |
| Orders | `OrderItem` gains designId, designFrontPreviewUrl, designBackPreviewUrl, printFrontUrl, printBackUrl, printedAt. Customer emails and order pages show the preview. |
| Moderation | Admin can "Hold" a custom item with a note (order `needsAttention`) and message the customer via WhatsApp link; no automated moderation. |

## 3. Data model

- `Design`: id, userId?, cartToken?, productId, colorName, frontJson (Json?), backJson (Json?), frontPreviewKey?, backPreviewKey?, frontPrintKey?, backPrintKey?, assetKeys (String[]), rightsConfirmed bool, createdAt. Index userId, cartToken.
- `CartItem.designId?` (FK Design, SetNull not allowed — cascade delete cart item when design deleted), `OrderItem` fields above, `StoreSetting.customFrontFeePaise`, `customBackFeePaise`, `Offer.includeCustom`.
- Cleanup job `purge-designs` (daily): designs older than 30 days not referenced by any cart item or order item → delete files and rows.

## 4. Storefront

- `/customize` landing: grid of customizable products (if none, friendly empty state). `/customize/[slug]` studio: left/top canvas with front/back toggle, right/bottom panel with tabs (Product: color swatches + size selector + stock; Upload; Text; Layers), sticky bottom bar on mobile with price and "Add to cart". Desktop: two columns; mobile (≤ 768 px): canvas full width, tool panel as a bottom sheet with tabs, pinch/drag supported by Fabric touch events, toolbar buttons ≥ 44 px.
- Product pages of customizable products show a "Customize this" button linking to the studio preselected.
- `?design=<id>` on the studio loads an existing design the requester owns (edit flow).
- Cart drawer and cart page show the design front preview thumbnail with a "Custom" badge and an "Edit design" link.

## 5. Admin

- `/admin/print-queue`: all custom order items in PAID or PROCESSING orders, oldest first, grouped toggle by color+size; each card shows front/back previews, product/color/size/qty, order number link, age; buttons: Download front print PNG, Download back print PNG, Download all (ZIP not required — sequential links acceptable), Mark printed (sets printedAt; when every custom item of an order is printed and the order is PAID it moves to PROCESSING automatically with an event), Hold (note + needsAttention).
- Order detail and print slip show design previews; the packing slip lists "Custom print: front/back".
- Nav item "Print queue" with count badge.
- Product editor already has `isCustomizable`; ensure it is toggleable and seed marks two basic tees customizable (plain black/white blanks).

## 6. API

`POST /api/designs` (multipart: json fields + preview/print blobs + asset references), `GET /api/designs/[id]` (owner only), `POST /api/designs/assets` (image upload, returns key + url for the canvas). All rate limited and size-checked with magic-byte validation from `storeImage`.

## 7. Testing

Unit: price with custom fees, DPI calculation, design ownership/merge, cart uniqueness with designs, purge job. Integration: designs service with real DB and local storage. Playwright: open studio on desktop and 390 × 844 mobile, add text "HELLO", switch to back, upload a fixture PNG, add to cart, cart shows custom thumbnail, checkout with mock pay, admin print queue shows item, download link returns image/png, mark printed moves order to PROCESSING.
