"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import {
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { runImport } from "@/modules/products/import";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

export async function importProducts(formData: FormData) {
  const profile = await requirePermission("products.write");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/dashboard/products/import?error=nofile");
  }
  if (file.size > MAX_FILE_BYTES) {
    redirect("/dashboard/products/import?error=toolarge");
  }
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
    redirect("/dashboard/products/import?error=badtype");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();

  // Store the raw file in the private imports bucket for audit
  const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${file.name}`;
  await admin.storage.from("imports").upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
  });

  const { data: importRow, error } = await admin
    .from("product_imports")
    .insert({
      file_name: file.name,
      storage_path: storagePath,
      status: "validating",
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !importRow) {
    redirect("/dashboard/products/import?error=createfailed");
  }

  // Phase 1A: run synchronously for moderate files.
  // Large catalogs move to the BullMQ worker (see src/workers) once Redis is provisioned.
  await runImport(buffer, file.name, importRow.id, profile.id, profile.country_id);

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/products/import");
  redirect("/dashboard/products/import");
}
