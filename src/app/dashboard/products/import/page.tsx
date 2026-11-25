import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { importProducts } from "./actions";

export const metadata = { title: "Import Products" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requirePermission("products.write");
  const supabase = await createSupabaseServerClient();

  const { data: imports } = await supabase
    .from("product_imports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="display text-2xl font-black">Import Products</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Upload an Excel (.xlsx) or CSV file. Rows are matched by SKU —
          existing products are updated, new SKUs are created.
        </p>
      </div>

      <form
        action={importProducts}
        className="bg-white border border-neutral-border rounded-lg p-5 space-y-4"
      >
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="file">
            Catalog file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,.xlsx,.xls"
            required
            className="text-sm"
          />
          <p className="text-xs text-charcoal-light mt-2">
            Expected columns: <code>sku</code>, <code>name</code>,{" "}
            <code>brand</code>, <code>model_number</code>, <code>category</code>
            , <code>subcategory</code>, <code>description</code>,{" "}
            <code>unit_of_measure</code>, <code>retail_price</code>,{" "}
            <code>wholesale_price</code>, <code>currency</code>,{" "}
            <code>availability</code> (available / on_request / discontinued).
            Only <code>sku</code> and <code>name</code> are mandatory.
          </p>
        </div>
        <button
          type="submit"
          className="bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2 text-sm"
        >
          Upload and Import
        </button>
      </form>

      <section>
        <h2 className="text-sm font-semibold text-charcoal-light uppercase tracking-wide mb-2">
          Recent imports
        </h2>
        <div className="border border-neutral-border rounded-lg overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Errors</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {(imports ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-charcoal-light py-6">
                    No imports yet.
                  </td>
                </tr>
              )}
              {(imports ?? []).map((imp) => (
                <tr key={imp.id}>
                  <td>{imp.file_name}</td>
                  <td className="capitalize">{imp.status.replace(/_/g, " ")}</td>
                  <td>{imp.total_rows}</td>
                  <td>{imp.created_rows}</td>
                  <td>{imp.updated_rows}</td>
                  <td className={imp.error_rows > 0 ? "text-tronic-red" : ""}>
                    {imp.error_rows}
                  </td>
                  <td className="text-xs text-charcoal-light">
                    {new Date(imp.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
