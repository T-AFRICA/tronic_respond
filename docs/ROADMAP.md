# TRONIC Response — Implementation Roadmap

## Phase 1A — Foundation ✅ (this codebase)
- [x] Architecture: modular monolith, integration adapters, worker split
- [x] Database: 33 tables, enums, FKs, indexes, RLS, storage buckets (migrations 0001–0009)
- [x] Staff authentication (Supabase Auth + middleware) and RBAC (4 roles × 22 permissions)
- [x] Product management: list/search (trigram), create/edit, Excel+CSV import (SKU upsert, validation, duplicate detection), price history
- [x] Sales Command Center shell: all 14 modules routed, brand system applied
- [x] Webhook inbox (signature check, dedupe, store-then-process)
- [x] WhatsApp cart → RFQ pipeline (idempotent, SKU mapping, staff notifications)
- [x] Manual RFQ fallback; RFQ assignment; draft quotation from RFQ with price snapshots
- [x] Meta catalog adapter + eligibility validation + sync worker + sync UI
- [ ] Respond.io capability validation against the live workspace (requires credentials)
- [ ] Meta Catalog connection to the WABA (requires Commerce Manager access)
- [ ] Product image upload UI + SKU-based image matching
- [ ] Staff invite flow UI

## Phase 1B — Native WhatsApp commerce
- Full catalog initial sync against the real catalog; verify eligibility at scale
- Respond.io webhook payload verification with real cart submissions
- Customer acknowledgment automation (Respond.io workflow)
- Real-time staff notification polish (in-app bell, optional email)

## Phase 1C — Sharing & broadcasting ✅ (built; live sends await Respond.io credentials)
- [x] Direct sharing composer: product search → multi-select (≤10) → customer search → preview → send image+description cards or a catalog link via Respond.io; history + message logs recorded
- [x] Customer synchronization from Respond.io contacts (idempotent upsert by contact ID then phone; staff edits win; re-runnable, 2,000 contacts per run)
- [x] Customer detail page: edit, assign staff, link Respond.io contact ID, block flag, RFQ + message history
- [x] Consent capture: staff opt-in/opt-out recording + automatic STOP/START keyword processing (EN + SW) in the webhook pipeline
- [x] Campaign composer: name, type (single/multi ≤30/full catalog/promo/new arrivals), products, segment or all-customers audience, approved template name, body, scheduling
- [x] Manager approval that materializes recipients with opt-out/blocked suppression; eligible-recipients CSV export for Respond.io's native Broadcast module; running/completed tracking
- [ ] Segment builder UI (segments table is live; members managed via DB for now)
- [ ] Live verification of sharing sends and contact sync against the real workspace (needs credentials)

## Phase 1D — Quotation completion ✅ (built; WhatsApp send awaits Respond.io credentials)
- [x] Full quotation builder (editable lines, discounts, taxes, delivery, validity, T&C, live totals, SKU product search)
- [x] Manager approval workflow: any discount (explicit % or price below list) requires `quotations.approve`; undiscounted quotations self-approve
- [x] Status machine enforced server-side (New → … → Sent → Accepted/Rejected/Revision Requested → Completed)
- [x] Branded PDF generation (pdf-lib, TRONIC red identity, paginated items table, disclaimer footer) stored in the private `quotations` bucket
- [x] Version snapshots on PDF generation and on revision start (v+1 reopens the builder)
- [x] WhatsApp delivery via Respond.io document message with a 7-day signed URL + companion text; manual-inbox fallback messaging in the UI
- [x] Customer decision capture (accept / reject / revision) with notes + preparer notifications
- [ ] Live send verification against the real Respond.io workspace (needs credentials)

## Phase 1E — Launch ✅ (built; checklists executed at deployment)
- [x] External catalog at `/catalog`: mobile-first, no registration, EN + Swahili, search + category filter, product detail with specs/images, client-side selection cart with quantities, Request Quotation (→ RFQ source `external_catalog` with manager notifications), Talk to Sales (wa.me), SKU-filtered links from the sharing composer
- [x] Catalog hardening: anon RLS limited to published products/retail prices, honeypot, phone validation, size caps
- [x] Secure expiring personalized links (HMAC tokens, 30 days) attaching catalog RFQs to known customers; wired into shared catalog links
- [x] Reports: avg/median response time (RFQ → quotation sent), conversion rate, staff performance table, most-requested products, campaign recipient analytics
- [x] Deployment runbook, security + performance checklists, backup/monitoring policy, half-day training outline (docs/DEPLOYMENT.md)
- [ ] Execute the security/performance checklists against the live deployment
- [ ] Technical-specification facet filters on the catalog (search + category shipped first)

## Phase 1F — Offers & API broadcast engine ✅ (built; live sends gated)
- [x] `pilot_products` bridge: non-destructive migration creates the table only if absent; one-click "Import pilot products" upserts products by SKU, records reference prices, and creates a draft offer with offer_price = imported RE price (already discounted — never discounted again)
- [x] Offers workspace: create offers (percentage / fixed price / individual prices), product, category or all-published selection, Excel/CSV offer-price import (resets verification), start/end scheduling, pause/cancel
- [x] Price-verification gate: unverified prices never reach customers; activation requires manager verification (`offers.activate`) and refuses overlapping active offers on the same products
- [x] Auto lifecycle: `sweep_offer_statuses()` activates due scheduled offers and expires ended ones (worker runs it every 5 min; manual sweep button)
- [x] Public offers catalog at `/catalog/offers` (EN+SW, mobile-first, search/category filters, strike-through reference price, savings, expiry, selection cart → RFQ)
- [x] API broadcast engine (Redis/BullMQ `campaign-send` worker): dry-run (no sends), internal test (allowlisted E.164 numbers only), live (one consolidated template message per eligible customer, batched, rate-limit aware, pause/resume/cancel, recipient-level results, resumable without duplicate sends)
- [x] Fail-closed live gates: env `ENABLE_LIVE_BROADCASTING` AND in-app Super Admin switch AND verified-approved template AND approved campaign; one live job per campaign ever (DB unique index)
- [x] Template approval tracking (`message_templates`, seeded with `tronic_special_offers`/pending) + Execution panel to record the verified Meta status
- [x] Message History screen (filters: direction, status, text; paginated)
- [x] Env aliases: `RESPOND_IO_*` spec names supported alongside legacy `RESPONDIO_*`; `RESPOND_IO_CHANNEL_ID`, `RESPOND_IO_TEMPLATE_NAME`, `APP_BASE_URL`
- [ ] Apply migration 0011 to the live Supabase project and run the pilot import against the real ~98 rows
- [ ] Verify `POST /contact/{id}/message` template payload + channelId against the live Respond.io workspace before first internal test

## Phase 2 — Reserved (not active)
- AI: product search, NL matching, support, recommendations, Voice-to-Quotation, Image-to-Product, Photo-to-Quotation (draft RFQs only; AI never invents prices/availability/specs; activates only after core workflow is stable)
- Payments: provider-independent gateway adapter (ClickPesa / Selcom / …): payment links, M-Pesa, Airtel Money, Mixx by Yas, HaloPesa, cards, USSD push, verification, receipts, refunds, reconciliation. Flow: Accepted Quotation → Payment Request → Verified Payment → Receipt → Order Confirmation.
