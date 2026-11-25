# TRONIC Response — Deployment, Security Testing & Training Runbook

## 1. Environments

| Environment | Web (Next.js) | Workers + Redis | Database |
| --- | --- | --- | --- |
| Production | Vercel (production) | Railway (or VPS with pm2/systemd) | Supabase project `tronic-response-prod` |
| Staging | Vercel (preview) | Railway staging service | Supabase project `tronic-response-staging` |
| Local | `npm run dev` | `npm run worker` + local Redis | Supabase local or staging |

## 2. First-time production setup

1. **Supabase**
   - Create the project; note URL, anon key, service-role key.
   - Apply migrations in order: `supabase db push` (or paste `supabase/migrations/0001…0010` into the SQL editor sequentially).
   - Enable daily backups and Point-in-Time Recovery (Settings → Database → Backups).
   - Auth: disable public signups (Settings → Auth → disable "Allow new users to sign up") — staff accounts are provisioned by admins only.
   - Create the first Super Admin (Auth → Add user, then the profile insert from the README).
2. **Vercel**
   - Import the GitHub repository; framework preset Next.js.
   - Set every variable from `.env.example` (production values). Service-role key and API tokens are server-side only — never prefix them `NEXT_PUBLIC_`.
   - Assign the production domain; set `NEXT_PUBLIC_APP_URL` to it.
3. **Railway (workers)**
   - Add a Redis instance; copy `REDIS_URL`.
   - Deploy the same repo as a service with start command `npm run worker`; give it the same env vars (it needs Supabase service role, Meta token, Redis).
4. **Respond.io**
   - Create a Developer API token; set `RESPONDIO_API_TOKEN`.
   - Add a webhook pointing to `https://<domain>/api/webhooks/respondio` for message/contact events; set `RESPONDIO_WEBHOOK_SECRET` if the plan signs webhooks.
   - On **Dashboard → Integrations**, confirm all config shows "Configured" and run a capability validation pass (send test message, receive test webhook) BEFORE enabling dependent features for staff.
   - Do not change anything about the existing WhatsApp channel.
5. **Meta Commerce Manager**
   - Create (or reuse) a Product Catalog; connect it to the WhatsApp Business Account.
   - Create a system user with `catalog_management`; generate a long-lived token.
   - Set `META_CATALOG_ID`, `META_ACCESS_TOKEN`; run a small test sync (publish 2–3 products → Meta Catalog → Sync Changes) and verify the items appear in Commerce Manager, then in WhatsApp.
6. **Catalog**
   - Set `NEXT_PUBLIC_WHATSAPP_NUMBER` (E.164 without `+`) and a long random `CATALOG_LINK_SECRET`.

## 3. Release process

- GitHub `main` → Vercel production; feature branches → preview deployments.
- Migrations are additive-only; apply them before promoting the build that needs them.
- Workers: redeploy Railway service after web deploys that change worker code.
- Rollback: Vercel "Promote previous deployment"; database changes must stay backward-compatible one release back.

## 4. Security checklist (run before launch and quarterly)

- [ ] RLS: for each role (super_admin, sales_manager, sales_staff, marketing_staff) verify via the Supabase SQL editor (`set role authenticated; set request.jwt.claims…`) that: wholesale prices are invisible to roles without quotations.write; RFQs limited to assignee for sales_staff; webhook_events/audit_logs unreadable without the right permission; anon sees ONLY published products/images/specs/retail prices.
- [ ] Webhook forgery: POST to `/api/webhooks/respondio` with a bad signature → expect 401; with a duplicate payload → expect `duplicate: true` and no second RFQ.
- [ ] Catalog abuse: submit the RFQ form with the honeypot filled → no RFQ row created; invalid phone rejected; >50 items rejected.
- [ ] Signed URLs: quotation PDF links expire (10 min staff preview, 7 days customer); the `quotations` bucket rejects anonymous reads.
- [ ] Personalized catalog tokens expire and fail on tamper.
- [ ] Secrets: no token appears in client bundles (`grep` the `.next/static` output for token prefixes).
- [ ] `npm audit` reviewed; dependencies current.
- [ ] Supabase Auth: signups disabled; password policy set; service-role key only in server envs.

## 5. Performance checklist

- [ ] Import a 10,000-row CSV: completes, error report correct, product list stays responsive (trigram search < 100 ms).
- [ ] Full catalog sync batches of 100 with worker concurrency 1; failures land in retry.
- [ ] Dashboard overview under 1 s with production data volumes.
- [ ] Public catalog page loads < 2 s on 3G-class mobile (images lazy-loaded).

## 6. Monitoring & backups

- Integrations screen: provider health + recent webhook events (check daily at first).
- Vercel + Railway logs for errors; BullMQ failed jobs retained for inspection.
- Supabase: daily backups + PITR verified by a quarterly restore drill into a scratch project.
- Weekly: review `webhook_events` with status `failed`, `catalog_sync_jobs` failures, and unmapped RFQ items.

## 7. Employee training outline (half-day)

1. **All staff (45 min):** sign-in, Sales Command Center tour, notifications, the WhatsApp-first customer journey, "a cart/accepted quotation is not a sale".
2. **Sales staff (60 min):** RFQ queue → review items (unmapped lines) → quotation builder (prices, discounts trigger approval) → PDF → send → record customer decision → revisions. Manual RFQ fallback. Direct product sharing composer.
3. **Sales managers (30 min):** assignment, approval queues (quotations + campaigns), reports, staff performance.
4. **Marketing (30 min):** campaign composer, consent rules (STOP/ACHA auto opt-out), recipient export → Respond.io Broadcast → mark running/completed.
5. **Admins (30 min):** product imports, publishing, Meta sync screen, integrations health, staff management, audit logs.

Training environment: the staging deployment with the demo dataset (import `docs/sample-products.csv` if provided); never train against production customer data.
