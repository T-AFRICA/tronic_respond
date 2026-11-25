# TRONIC Response — Product Requirements Document (PRD)

**Version:** 1.0 · **Date:** 2026-11-24 · **Status:** Phase 1 in development

## 1. Vision

TRONIC Response is a WhatsApp-first sales enablement platform that eliminates
communication gaps between customers and sales employees. Customers discover
products, select quantities and request quotations directly inside WhatsApp;
staff respond faster with centralized product data, structured RFQs and
branded quotations. Benchmark: Schneider Electric's Koko 2.0 customer
experience (as a business benchmark only — no proprietary design or IP is copied).

**Tagline:** Faster Responses. Smarter Sales.

## 2. Context

| Fact | Value |
| --- | --- |
| Product count | ~8,000–10,000 |
| Communication platform | Respond.io (existing account, kept as primary) |
| WhatsApp | Official number + verified Meta Business account (existing) |
| Existing systems | E-commerce site, Shopify, SAP, POS — **explicitly out of scope** |
| Primary market | Tanzania (TZS), schema is country-aware for expansion |
| Languages (customer-facing catalog) | English + Swahili |

## 3. Goals

1. Customers complete product discovery → cart → quotation request without leaving WhatsApp.
2. Every WhatsApp cart becomes a tracked RFQ within seconds, with staff notified.
3. Staff share products in seconds (no manual image downloads/forwarding).
4. Marketing runs consent-respecting product broadcasts with approval workflow.
5. Management sees real conversion and performance analytics.

**Non-goals (Phase 1):** online payments, live inventory, AI automation,
replacing Respond.io, another conventional e-commerce website.

## 4. Users and roles

| Role | Capabilities |
| --- | --- |
| Super Admin | Everything: products, users, permissions, customers, integrations, campaigns, quotations, analytics, settings |
| Sales Manager | Manage staff, assign RFQs, approve quotations, authorize discounts, monitor performance |
| Sales Staff | Search/share products, review assigned RFQs, prepare quotations, communicate with customers |
| Marketing Staff | Prepare campaigns, select products, manage segments, monitor results |
| Customer | No login. Interacts via WhatsApp; optional external catalog with no mandatory registration |

## 5. Core user journey (WhatsApp-first)

1. Customer sends "Hi" to the TRONIC WhatsApp number.
2. Respond.io automation sends the welcome message with catalog / quotation / sales-support options.
3. Customer browses the Meta Product Catalog natively inside WhatsApp.
4. Customer adds products to the native WhatsApp cart, sets quantities, submits.
5. Respond.io receives the order message; its webhook notifies TRONIC Response.
6. TRONIC Response maps Meta product IDs → internal SKUs and creates a unique RFQ (idempotent).
7. Sales staff are notified; the customer receives an acknowledgment.
8. Staff verify pricing/availability, build a branded PDF quotation (manager approval for discounts).
9. Quotation is delivered in the same WhatsApp conversation.
10. Customer accepts / rejects / requests revision; staff record the outcome.

**Invariants:** a cart submission is a quotation request, never a purchase;
an accepted quotation is never a payment. Incoming payloads are validated
for product + quantity data before automatic RFQ creation; a manual RFQ
fallback always exists.

## 6. Functional requirements (Phase 1)

### 6.1 Product management (central database: Supabase)
- 10,000+ products: SKU (unique), name, brand, model, category/subcategory,
  description, technical specs, images, retail + wholesale price (wholesale
  confidential), currency, unit of measure, availability, visibility,
  Meta catalog ID, sync status.
- Excel/CSV import (SKU-keyed upsert, per-row validation, duplicate
  detection), image upload with SKU-based matching, bulk editing,
  publish/archive. No real-time stock display.

### 6.2 Meta Product Catalog sync
- Initial full sync, incremental updates, image/price/availability sync,
  eligibility validation, sync logs, failed retry, duplicate prevention
  (retailer_id = SKU), manual resync.
- Only eligible, publicly shareable data; published price labeled "subject
  to quotation confirmation"; products without a publishable price go to the
  external RFQ catalog only.

### 6.3 Respond.io integration
- Keep all existing contacts/conversations/connectivity. Customer sync,
  contact mapping, message sending, product sharing, PDF delivery, approved
  templates, conversation assignment, tagging, product-message webhooks,
  delivery tracking, health monitoring. Only officially verified
  capabilities are used; no invented endpoints; manual fallbacks everywhere.

### 6.4 Direct product sharing
- Fast search (SKU/name/model/spec), multi-select, preview, customer
  selection, send images+descriptions or native product messages (where
  verified), full/filtered catalog links, complete sharing history.

### 6.5 Broadcasting
- Campaign types: single-product, multi-product (≤30 products — Meta limit),
  full catalog, promos, new arrivals. Segmentation, approved templates,
  previews, manager approval, scheduling, marketing consent + opt-out
  suppression, engagement analytics. Respond.io native Broadcast module is
  the initial execution engine.

### 6.6 RFQ & quotation management
- RFQ: unique reference, customer + Respond.io contact ID, items (SKU,
  quantity), notes, source channel, assignee, timestamps.
- Quotation builder: editable prices, retail/wholesale rates, discounts,
  taxes, delivery charges, currency, availability, validity, T&C, manager
  approval, PDF generation, version history, acceptance/rejection.
- Status flow: New → Assigned → Under Review → Prepared → Approved → Sent →
  Accepted / Rejected / Revision Requested → Completed.
- Historical price snapshots on every quotation line.

### 6.7 Optional external catalog
- Mobile-first, no mandatory registration, EN + SW, search + spec filters,
  multi-select + quantities, Request Quotation, Talk to Sales, secure
  expiring personalized links when identification is needed. Optional —
  WhatsApp remains primary.

### 6.8 Admin dashboard (Sales Command Center)
- Modules: Overview, Products, Categories, Meta Catalog, Customers, Direct
  Product Sharing, Broadcasting, Quotation Requests, Quotations, Staff
  Management, Reports, Integrations, Audit Logs, Settings.
- Metrics (all live DB aggregates): total products, synced products, sync
  failures, customers, new RFQs, pending/sent/accepted quotations,
  conversion rate, active campaigns, response time, top products, staff
  performance.

## 7. Phase 2 (reserved, not active)
- AI: product search, NL matching, support, recommendations,
  Voice-to-Quotation, Image-to-Product, Photo-to-Quotation (handwritten list
  → draft RFQ for staff verification; AI never invents prices/availability/specs).
- Payments: provider-independent gateway adapter (ClickPesa/Selcom/…),
  mobile money (M-Pesa, Airtel Money, Mixx by Yas, HaloPesa), cards, USSD
  push, verification, receipts, refunds, reconciliation.
  Flow: Accepted Quotation → Payment Request → Verified Payment → Receipt → Order Confirmation.

## 8. Success metrics
- Time from cart submission to staff notification: < 1 minute.
- Time from RFQ to quotation sent (median): tracked, target set after baseline.
- Quotation conversion rate: tracked from day one.
- Catalog sync success rate: > 99% of eligible products.
- Zero duplicate RFQs from webhook redelivery; zero broadcasts to opted-out customers.
