-- TRONIC Response — 0001: extensions and enum types
-- All enums are defined up front so later migrations can reference them.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm"; -- trigram search for fast product lookup

-- ----- Identity / RBAC -----
create type public.app_role as enum (
  'super_admin',
  'sales_manager',
  'sales_staff',
  'marketing_staff'
);

-- ----- Products -----
create type public.product_visibility as enum ('draft', 'published', 'archived');

create type public.product_availability as enum (
  'available',          -- normally orderable (NOT live stock — system is independent of SAP/POS)
  'on_request',         -- availability confirmed per quotation
  'discontinued'
);

create type public.price_type as enum ('retail', 'wholesale');

create type public.import_status as enum (
  'pending', 'validating', 'processing', 'completed', 'completed_with_errors', 'failed'
);

-- ----- Meta catalog sync -----
create type public.sync_status as enum (
  'not_synced', 'queued', 'syncing', 'synced', 'failed', 'excluded'
);

create type public.sync_job_type as enum (
  'initial_full_sync', 'incremental_update', 'image_sync', 'price_sync',
  'availability_sync', 'manual_resync', 'retry_failed'
);

create type public.sync_job_status as enum (
  'queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'
);

-- ----- Customers -----
create type public.consent_channel as enum ('whatsapp_marketing', 'whatsapp_transactional');
create type public.consent_status as enum ('granted', 'revoked', 'unknown');

-- ----- RFQ / Quotations -----
create type public.rfq_source as enum (
  'whatsapp_cart',      -- native WhatsApp cart submission via Respond.io webhook
  'external_catalog',   -- optional advanced digital catalog
  'manual',             -- staff-entered fallback
  'whatsapp_message'    -- free-text request converted by staff
);

create type public.rfq_status as enum (
  'new', 'assigned', 'under_review', 'quoted', 'closed', 'cancelled'
);

create type public.quotation_status as enum (
  'new', 'assigned', 'under_review', 'prepared', 'approved', 'sent',
  'accepted', 'rejected', 'revision_requested', 'completed', 'expired', 'cancelled'
);

create type public.approval_decision as enum ('pending', 'approved', 'rejected');

-- ----- Campaigns / messaging -----
create type public.campaign_type as enum (
  'single_product', 'multi_product', 'full_catalog', 'promotional', 'new_arrivals'
);

create type public.campaign_status as enum (
  'draft', 'pending_approval', 'approved', 'scheduled', 'running',
  'completed', 'cancelled', 'rejected'
);

create type public.message_direction as enum ('outbound', 'inbound');

create type public.message_status as enum (
  'queued', 'sent', 'delivered', 'read', 'failed', 'unknown'
);

create type public.message_kind as enum (
  'text', 'template', 'product', 'product_list', 'document', 'image', 'catalog_link', 'other'
);

create type public.webhook_status as enum ('received', 'processing', 'processed', 'failed', 'ignored', 'duplicate');

create type public.notification_kind as enum (
  'rfq_created', 'rfq_assigned', 'quotation_approval_requested', 'quotation_approved',
  'quotation_rejected', 'quotation_accepted', 'quotation_revision_requested',
  'campaign_approval_requested', 'sync_failed', 'integration_down', 'system'
);
