# TRONIC Response — UI/UX Design Specification

## Brand identity

| Token | Value | Usage |
| --- | --- | --- |
| TRONIC Red | `#D6001C` (`--color-tronic-red`) | Primary actions, active states, brand mark, alerts |
| Red dark | `#A80016` | Hover states |
| Red soft | `#FDEEF0` | Error/alert backgrounds |
| White | `#FFFFFF` | Cards, tables, surfaces |
| Soft neutral gray | `#F5F5F4` bg / `#E4E4E2` borders | Page background, dividers |
| Dark charcoal | `#2B2B2B` text / `#4A4A4A` secondary | Typography |

> Adjust `--color-tronic-red` in `src/app/globals.css` to the exact brand
> red from TRONIC's official guidelines if it differs.

## Typography

- **Primary interface:** Myriad Pro. The licensed font files must be
  purchased/placed in `/public/fonts` and wired via `@font-face`; until
  then the stack falls back to Segoe UI / system sans (declared in
  `--font-sans`). Do not ship unlicensed font binaries.
- **Display headings:** Arial Black (`--font-display`, class `display`) —
  used sparingly for page titles and the brand mark.
- Body 14px (text-sm) for data-dense screens; accessible contrast (charcoal
  on white ≥ 12:1).

## Design principles

- Premium corporate enterprise feel: clean layouts, consistent 4px-grid
  spacing, compact data tables (`.data-table` utility), minimal shadows
  (1px borders instead), professional iconography.
- Explicitly avoided: gradients, oversized cards, glassmorphism, generic
  AI-generated aesthetics.
- Desktop-first for staff (dashboard optimized ≥1280px, responsive down to
  tablet); mobile-first for the customer-facing external catalog.
- Fast loading: server components, no client JS where not needed, paginated
  tables.

## Layout system

- **Staff shell:** fixed 240px charcoal sidebar (brand mark + grouped nav,
  permission-filtered), white topbar (user identity + sign out), content
  area on neutral gray with max-width containers.
- **Status communication:** pill badges (sync status, RFQ/quotation status)
  with semantic colors — red for failures/new-and-waiting, amber for
  in-progress, green for success, gray for neutral.
- **Forms:** white cards, 1px borders, labeled inputs, red focus ring,
  inline validation messages in red-soft blocks; confidential fields
  (wholesale price) explicitly marked.
- **Tables:** uppercase 11px column headers, 8px cell padding, hover row
  highlight, monospace for SKUs/references, right column for timestamps in
  muted small text.

## Key screens

| Screen | Essentials |
| --- | --- |
| Login | Centered card, brand mark, email+password only (staff accounts are provisioned, no self-signup) |
| Overview | Metric card grid grouped Catalog / Sales Pipeline / Marketing — live DB aggregates |
| Products | Search + filters row, compact table, SKU links, sync badges, Import + Add actions |
| Import | Upload card with column documentation, history table with per-import error counts |
| Meta Catalog | Sync counters, 3 sync actions (changes / full / retry), job history |
| RFQ detail | 3-card header (customer / assignment / notes), items table with mapping badges, Create Quotation CTA |
| Quotation detail | Customer + totals cards, line-item table (list vs quoted price, discount) |
| Integrations | Config checklist, provider health pills, webhook event log |

## Accessibility

- Semantic HTML (tables, labels, nav landmarks), focus-visible rings,
  color never the sole status carrier (text labels in every badge),
  WCAG AA contrast minimums.

## Customer catalog (Phase 1E)

Mobile-first, thumb-reachable actions, EN/SW toggle, product cards with
image/name/SKU, quantity steppers, persistent "Request Quotation" bar,
"Talk to Sales" deep link to WhatsApp (`wa.me/<number>`), no registration.
