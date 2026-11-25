# TRONIC Response

**Faster Responses. Smarter Sales.**

A WhatsApp-first enterprise sales enablement platform for TRONIC. Customers
discover products, build carts and request quotations directly inside
WhatsApp; sales staff manage products, RFQs, quotations, sharing and
broadcasts from a central Sales Command Center.

This is a **completely independent application** — it does not integrate with
or modify the TRONIC e-commerce website, Shopify, SAP, POS, or the existing
website admin system. Respond.io remains the primary communication platform.

## Architecture

Modular monolith (Next.js App Router) with separated business services and
external integration adapters:

```
src/
  app/                    Next.js routes
    login/                Staff authentication
    dashboard/            Sales Command Center (all staff modules)
    api/webhooks/         Respond.io webhook inbox (store-then-process)
  modules/                Business services
    products/             Catalog service + Excel/CSV import
    rfq/                  WhatsApp cart → RFQ pipeline (idempotent)
    webhooks/             Webhook event processor
  integrations/           External adapters (verify capabilities before use)
    respondio/            Respond.io Developer API v2 client
    meta/                 Meta Product Catalog (Graph API items_batch)
  workers/                BullMQ consumers (deploy on Railway/VPS)
  lib/                    Supabase clients, auth/session, queues, types
supabase/migrations/      Version-controlled PostgreSQL schema + RLS
docs/                     PRD, TRD, ERD, flows, UI/UX spec, roadmap
```

## Stack

Next.js · React · TypeScript · Tailwind CSS · Supabase (PostgreSQL, Auth,
Storage, RLS) · Redis + BullMQ · Respond.io Developer API · Meta Commerce
Manager · Vercel (web) · Railway/VPS (workers).

## Getting started

1. **Supabase**: create a project, then apply migrations in order:
   `supabase/migrations/0001…0009` (via `supabase db push` or the SQL editor).
2. **Environment**: `cp .env.example .env.local` and fill in Supabase keys.
   Respond.io / Meta / Redis values can be added later — the app runs without
   them (integration features show "not configured").
3. **First Super Admin**: create a user in Supabase Auth (Dashboard → Auth →
   Add user), then insert their profile:
   ```sql
   insert into public.profiles (id, full_name, email, role_id, country_id)
   values ('<auth-user-uuid>', 'Your Name', 'you@tronic.co.tz',
           (select id from roles where key = 'super_admin'),
           (select id from countries where iso2 = 'TZ'));
   ```
4. **Run**: `npm install` then `npm run dev` → http://localhost:3000
5. **Workers** (needed for Meta catalog sync): set `REDIS_URL`, then
   `npm run worker` on Railway/VPS.

## Integration setup (Phase 1A/1B)

- **Respond.io**: create a Developer API token; point a webhook at
  `https://<app-domain>/api/webhooks/respondio`; set
  `RESPONDIO_WEBHOOK_SECRET` if the workspace supports signed webhooks.
  Verify plan capabilities on **Dashboard → Integrations** before enabling
  dependent features. The existing WhatsApp number is never touched.
- **Meta**: create/connect a Product Catalog to the WhatsApp Business
  Account in Commerce Manager; create a system-user token with
  `catalog_management`; set `META_CATALOG_ID` + `META_ACCESS_TOKEN`.
  Only published products with a retail price and image are synchronized —
  wholesale prices never leave this system.

## Key invariants

- A WhatsApp cart submission creates a **quotation request — never an order**.
- An accepted quotation is **not** a payment or completed sale (payments are Phase 2).
- No real-time stock display (independent from SAP/POS).
- RFQ creation is idempotent (webhook dedupe key = RFQ idempotency key).
- All dashboard analytics are live database aggregates — never fabricated.

See `docs/` for the PRD, TRD, database ERD, application flows, UI/UX
specification and the phased roadmap.
