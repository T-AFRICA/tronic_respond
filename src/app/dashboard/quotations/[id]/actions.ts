"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import {
  computeTotals,
  canTransition,
  requiresManagerApproval,
  EDITABLE_STATUSES,
  type QuotationLineInput,
} from "@/modules/quotations/service";
import { renderQuotationPdf } from "@/modules/quotations/pdf";
import {
  sendDocumentMessage,
  sendTextMessage,
  getMessageStatus,
} from "@/integrations/respondio/client";
import type { QuotationStatus } from "@/lib/types";
import { respondIoConfig } from "@/lib/config";

const lineSchema = z.object({
  product_id: z.string().uuid().nullable(),
  sku: z.string().trim().min(1).max(64),
  product_name: z.string().trim().min(1).max(300),
  quantity: z.coerce.number().positive(),
  list_price: z.coerce.number().nonnegative(),
  price_type: z.enum(["retail", "wholesale"]),
  unit_price: z.coerce.number().nonnegative(),
  discount_pct: z.coerce.number().min(0).max(100),
  tax_pct: z.coerce.number().min(0).max(100),
  availability_note: z.string().trim().max(300).default(""),
});

const saveSchema = z.object({
  lines: z.array(lineSchema).min(1).max(200),
  currency: z.string().trim().length(3).toUpperCase(),
  delivery_charge: z.coerce.number().nonnegative(),
  valid_until: z.string().nullable(),
  terms_conditions: z.string().max(10000),
  internal_notes: z.string().max(5000),
});

async function loadEditableQuotation(quotationId: string) {
  const profile = await requirePermission("quotations.write");
  const supabase = await createSupabaseServerClient();
  const { data: quotation } = await supabase
    .from("quotations")
    .select("*")
    .eq("id", quotationId)
    .single();
  if (!quotation) redirect("/dashboard/quotations");
  return { profile, supabase, quotation };
}

function notifyUsers(
  userIds: string[],
  kind: string,
  title: string,
  body: string,
  link: string,
) {
  if (userIds.length === 0) return Promise.resolve();
  const admin = createSupabaseAdminClient();
  return admin.from("notifications").insert(
    userIds.map((user_id) => ({ user_id, kind, title, body, link })),
  );
}

async function managerIds(): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, roles!inner(key)")
    .in("roles.key", ["sales_manager", "super_admin"])
    .eq("is_active", true);
  return (data ?? []).map((m) => m.id);
}

// ---------------------------------------------------------------- save -----

export async function saveQuotation(quotationId: string, payload: unknown) {
  const { profile, supabase, quotation } =
    await loadEditableQuotation(quotationId);

  if (!EDITABLE_STATUSES.includes(quotation.status as QuotationStatus)) {
    return { ok: false as const, error: "Quotation is no longer editable." };
  }

  const parsed = saveSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const totals = computeTotals(
    parsed.data.lines as QuotationLineInput[],
    parsed.data.delivery_charge,
  );

  // Replace line items wholesale (simple + safe at this scale)
  const { error: delError } = await supabase
    .from("quotation_items")
    .delete()
    .eq("quotation_id", quotationId);
  if (delError) return { ok: false as const, error: delError.message };

  const { error: insError } = await supabase.from("quotation_items").insert(
    totals.lines.map((line, idx) => ({
      quotation_id: quotationId,
      product_id: line.product_id,
      sku: line.sku,
      product_name: line.product_name,
      quantity: line.quantity,
      list_price: line.list_price,
      price_type: line.price_type,
      unit_price: line.unit_price,
      discount_pct: line.discount_pct,
      tax_pct: line.tax_pct,
      line_total: line.line_total,
      availability_note: line.availability_note,
      sort_order: idx,
    })),
  );
  if (insError) return { ok: false as const, error: insError.message };

  const nextStatus =
    quotation.status === "new" || quotation.status === "assigned"
      ? "under_review"
      : quotation.status;

  const { error: updError } = await supabase
    .from("quotations")
    .update({
      currency: parsed.data.currency,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      tax_total: totals.tax_total,
      delivery_charge: parsed.data.delivery_charge,
      grand_total: totals.grand_total,
      valid_until: parsed.data.valid_until,
      terms_conditions: parsed.data.terms_conditions,
      internal_notes: parsed.data.internal_notes,
      status: nextStatus,
      prepared_by: quotation.prepared_by ?? profile.id,
    })
    .eq("id", quotationId);
  if (updError) return { ok: false as const, error: updError.message };

  revalidatePath(`/dashboard/quotations/${quotationId}`);
  revalidatePath("/dashboard/quotations");
  return { ok: true as const };
}

// ------------------------------------------------- product line lookup -----

export async function lookupProductBySku(sku: string) {
  await requirePermission("quotations.write");
  const supabase = await createSupabaseServerClient();

  const term = sku.trim();
  if (!term) return { ok: false as const, error: "Enter a SKU or name." };

  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name, currency")
    .or(`sku.ilike.%${term}%,name.ilike.%${term}%`)
    .limit(8);

  if (!products || products.length === 0) {
    return { ok: false as const, error: "No matching product." };
  }

  const ids = products.map((p) => p.id);
  const { data: prices } = await supabase
    .from("current_product_prices")
    .select("product_id, price_type, amount")
    .in("product_id", ids);

  return {
    ok: true as const,
    products: products.map((p) => ({
      ...p,
      retail_price:
        prices?.find((x) => x.product_id === p.id && x.price_type === "retail")
          ?.amount ?? 0,
      wholesale_price:
        prices?.find(
          (x) => x.product_id === p.id && x.price_type === "wholesale",
        )?.amount ?? null,
    })),
  };
}

// ----------------------------------------------------------- approval ------

export async function submitForApproval(quotationId: string) {
  const { profile, supabase, quotation } =
    await loadEditableQuotation(quotationId);

  if (!canTransition(quotation.status, "prepared") && quotation.status !== "prepared") {
    redirect(`/dashboard/quotations/${quotationId}?error=state`);
  }

  const { data: items } = await supabase
    .from("quotation_items")
    .select("*")
    .eq("quotation_id", quotationId);
  if (!items || items.length === 0) {
    redirect(`/dashboard/quotations/${quotationId}?error=noitems`);
  }

  const needsManager = requiresManagerApproval(
    items as unknown as QuotationLineInput[],
  );
  const isManager = hasPermission(profile, "quotations.approve");

  if (!needsManager || isManager) {
    // Direct approval: no discounts, or the actor is a manager.
    await supabase
      .from("quotations")
      .update({ status: "approved" })
      .eq("id", quotationId);
    revalidatePath(`/dashboard/quotations/${quotationId}`);
    redirect(`/dashboard/quotations/${quotationId}?approved=1`);
  }

  await supabase
    .from("quotations")
    .update({ status: "prepared" })
    .eq("id", quotationId);

  await supabase.from("quotation_approvals").insert({
    quotation_id: quotationId,
    version: quotation.version,
    requested_by: profile.id,
  });

  await notifyUsers(
    await managerIds(),
    "quotation_approval_requested",
    `Approval requested: ${quotation.reference}`,
    `${profile.full_name} requests approval (discounted quotation).`,
    `/dashboard/quotations/${quotationId}`,
  );

  revalidatePath(`/dashboard/quotations/${quotationId}`);
  redirect(`/dashboard/quotations/${quotationId}?requested=1`);
}

export async function decideApproval(
  quotationId: string,
  approvalId: string,
  formData: FormData,
) {
  const profile = await requirePermission("quotations.approve");
  const decision = String(formData.get("decision") ?? "");
  const comments = String(formData.get("comments") ?? "");
  if (!["approved", "rejected"].includes(decision)) return;

  const supabase = await createSupabaseServerClient();

  const { data: approval } = await supabase
    .from("quotation_approvals")
    .update({
      approver_id: profile.id,
      decision,
      comments,
      decided_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
    .eq("decision", "pending")
    .select("requested_by")
    .single();

  await supabase
    .from("quotations")
    .update({ status: decision === "approved" ? "approved" : "under_review" })
    .eq("id", quotationId);

  if (approval) {
    await notifyUsers(
      [approval.requested_by],
      decision === "approved" ? "quotation_approved" : "quotation_rejected",
      `Quotation ${decision === "approved" ? "approved" : "returned"}`,
      comments || `Decision by ${profile.full_name}`,
      `/dashboard/quotations/${quotationId}`,
    );
  }

  revalidatePath(`/dashboard/quotations/${quotationId}`);
}

// ---------------------------------------------------------------- PDF ------

export async function generatePdf(quotationId: string) {
  const profile = await requirePermission("quotations.write");
  const supabase = await createSupabaseServerClient();

  const { data: q } = await supabase
    .from("quotations")
    .select("*, quotation_items(*), customers(full_name, company_name, whatsapp_phone, email)")
    .eq("id", quotationId)
    .single();
  if (!q) redirect("/dashboard/quotations");

  if (!["approved", "sent", "accepted"].includes(q.status)) {
    redirect(`/dashboard/quotations/${quotationId}?error=notapproved`);
  }

  const customer = Array.isArray(q.customers) ? q.customers[0] : q.customers;
  const pdfBytes = await renderQuotationPdf({ quotation: q, customer });

  const admin = createSupabaseAdminClient();
  const storagePath = `${q.reference}/v${q.version}.pdf`;
  const { error: upError } = await admin.storage
    .from("quotations")
    .upload(storagePath, Buffer.from(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upError) {
    redirect(`/dashboard/quotations/${quotationId}?error=pdfupload`);
  }

  await supabase
    .from("quotations")
    .update({ pdf_storage_path: storagePath })
    .eq("id", quotationId);

  // Immutable snapshot of this version
  await admin.from("quotation_versions").upsert(
    {
      quotation_id: quotationId,
      version: q.version,
      snapshot: { quotation: q, items: q.quotation_items },
      pdf_storage_path: storagePath,
      created_by: profile.id,
    },
    { onConflict: "quotation_id,version" },
  );

  revalidatePath(`/dashboard/quotations/${quotationId}`);
  redirect(`/dashboard/quotations/${quotationId}?pdf=1`);
}

/** Short-lived signed URL for staff preview of the private PDF. */
export async function getPdfUrl(quotationId: string) {
  await requirePermission("quotations.read");
  const supabase = await createSupabaseServerClient();
  const { data: q } = await supabase
    .from("quotations")
    .select("pdf_storage_path")
    .eq("id", quotationId)
    .single();
  if (!q?.pdf_storage_path) return { ok: false as const, error: "No PDF yet." };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from("quotations")
    .createSignedUrl(q.pdf_storage_path, 60 * 10);
  if (error || !data) return { ok: false as const, error: "Could not sign URL." };
  return { ok: true as const, url: data.signedUrl };
}

// --------------------------------------------------------------- send ------

export async function sendQuotation(quotationId: string) {
  const profile = await requirePermission("quotations.send");
  const supabase = await createSupabaseServerClient();

  const { data: q } = await supabase
    .from("quotations")
    .select("*, customers(id, respondio_contact_id, full_name)")
    .eq("id", quotationId)
    .single();
  if (!q) redirect("/dashboard/quotations");

  if (q.status !== "approved") {
    redirect(`/dashboard/quotations/${quotationId}?error=notapproved`);
  }
  if (!q.pdf_storage_path) {
    redirect(`/dashboard/quotations/${quotationId}?error=nopdf`);
  }
  if (!respondIoConfig.token()) {
    redirect(`/dashboard/quotations/${quotationId}?error=norespondio`);
  }

  const customer = Array.isArray(q.customers) ? q.customers[0] : q.customers;
  if (!customer?.respondio_contact_id) {
    redirect(`/dashboard/quotations/${quotationId}?error=nocontact`);
  }

  const admin = createSupabaseAdminClient();
  // 7-day signed URL: long enough for WhatsApp/Respond.io to fetch and for
  // the customer to re-download, while the bucket itself stays private.
  const { data: signed, error: signError } = await admin.storage
    .from("quotations")
    .createSignedUrl(q.pdf_storage_path, 7 * 24 * 3600);
  if (signError || !signed) {
    redirect(`/dashboard/quotations/${quotationId}?error=sign`);
  }

  let result: { messageId: number } | undefined;
  try {
    result = await sendDocumentMessage(
      customer.respondio_contact_id,
      signed.signedUrl,
      `${q.reference}.pdf`,
    );
  } catch {
    redirect(`/dashboard/quotations/${quotationId}?error=sendfailed`);
  }

  // Respond.io accepts the message first; WhatsApp may still reject it moments
  // later (most commonly: the 24h customer-service window is closed, since a
  // PDF is a session message, not a template). Poll so "sent" means delivered
  // to WhatsApp — otherwise staff would see success for a message nobody got.
  let failReason: string | null = null;
  if (result?.messageId) {
    for (const waitMs of [3000, 4000, 5000]) {
      await new Promise((r) => setTimeout(r, waitMs));
      try {
        const st = await getMessageStatus(
          customer.respondio_contact_id,
          result.messageId,
        );
        const failedEntry = (st.status ?? []).find((s) => s.value === "failed");
        if (failedEntry) {
          failReason = failedEntry.message ?? "provider failure";
          break;
        }
        const accepted =
          Boolean(st.channelMessageId) ||
          (st.status ?? []).some((s) =>
            ["sent", "delivered", "read"].includes(s.value),
          );
        if (accepted) break;
      } catch {
        // status read hiccup — keep polling, never fail the send on a read error
      }
    }
  }

  if (failReason) {
    await admin.from("message_logs").insert({
      customer_id: customer.id,
      respondio_contact_id: customer.respondio_contact_id,
      respondio_message_id: result?.messageId ? String(result.messageId) : null,
      direction: "outbound",
      kind: "document",
      status: "failed",
      body_preview: `Quotation ${q.reference} v${q.version} — ${failReason}`.slice(0, 500),
      quotation_id: quotationId,
      sent_by: profile.id,
    });
    redirect(
      `/dashboard/quotations/${quotationId}?error=${
        /window/i.test(failReason) ? "window" : "sendfailed"
      }`,
    );
  }

  await sendTextMessage(
    customer.respondio_contact_id,
    `Your TRONIC quotation ${q.reference} is attached. It is valid until ${
      q.valid_until ?? "the date stated in the document"
    }. Reply here to accept, ask questions, or request changes.`,
  ).catch(() => undefined); // companion text is best-effort

  await admin.from("message_logs").insert({
    customer_id: customer.id,
    respondio_contact_id: customer.respondio_contact_id,
    respondio_message_id: result?.messageId ? String(result.messageId) : null,
    direction: "outbound",
    kind: "document",
    status: "sent",
    body_preview: `Quotation ${q.reference} v${q.version}`,
    quotation_id: quotationId,
    sent_by: profile.id,
  });

  await supabase
    .from("quotations")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", quotationId);

  revalidatePath(`/dashboard/quotations/${quotationId}`);
  redirect(`/dashboard/quotations/${quotationId}?sent=1`);
}

// ----------------------------------------------- decision & revisions ------

export async function recordDecision(quotationId: string, formData: FormData) {
  await requirePermission("quotations.write");
  const decision = String(formData.get("decision") ?? "");
  const notes = String(formData.get("notes") ?? "");
  if (!["accepted", "rejected", "revision_requested"].includes(decision)) return;

  const supabase = await createSupabaseServerClient();
  const { data: q } = await supabase
    .from("quotations")
    .select("status, prepared_by, reference")
    .eq("id", quotationId)
    .single();
  if (!q || !canTransition(q.status, decision as QuotationStatus)) {
    redirect(`/dashboard/quotations/${quotationId}?error=state`);
  }

  await supabase
    .from("quotations")
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decision_notes: notes,
    })
    .eq("id", quotationId);

  if (q.prepared_by) {
    await notifyUsers(
      [q.prepared_by],
      decision === "accepted"
        ? "quotation_accepted"
        : decision === "rejected"
          ? "quotation_rejected"
          : "quotation_revision_requested",
      `${q.reference}: customer ${decision.replace(/_/g, " ")}`,
      notes,
      `/dashboard/quotations/${quotationId}`,
    );
  }

  revalidatePath(`/dashboard/quotations/${quotationId}`);
  revalidatePath("/dashboard/quotations");
}

/** Start a new version after a revision request: snapshot, bump, reopen. */
export async function startRevision(quotationId: string) {
  const profile = await requirePermission("quotations.write");
  const supabase = await createSupabaseServerClient();

  const { data: q } = await supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("id", quotationId)
    .single();
  if (!q || q.status !== "revision_requested") {
    redirect(`/dashboard/quotations/${quotationId}?error=state`);
  }

  const admin = createSupabaseAdminClient();
  await admin.from("quotation_versions").upsert(
    {
      quotation_id: quotationId,
      version: q.version,
      snapshot: { quotation: q, items: q.quotation_items },
      pdf_storage_path: q.pdf_storage_path,
      created_by: profile.id,
    },
    { onConflict: "quotation_id,version" },
  );

  await supabase
    .from("quotations")
    .update({
      version: q.version + 1,
      status: "under_review",
      pdf_storage_path: null,
      sent_at: null,
      decided_at: null,
    })
    .eq("id", quotationId);

  revalidatePath(`/dashboard/quotations/${quotationId}`);
}

/** Simple transitions: complete / cancel / reopen expired. */
export async function setQuotationStatus(
  quotationId: string,
  to: QuotationStatus,
) {
  await requirePermission("quotations.write");
  const supabase = await createSupabaseServerClient();
  const { data: q } = await supabase
    .from("quotations")
    .select("status")
    .eq("id", quotationId)
    .single();
  if (!q || !canTransition(q.status, to)) {
    redirect(`/dashboard/quotations/${quotationId}?error=state`);
  }
  await supabase.from("quotations").update({ status: to }).eq("id", quotationId);
  revalidatePath(`/dashboard/quotations/${quotationId}`);
  revalidatePath("/dashboard/quotations");
}
