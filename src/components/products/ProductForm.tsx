import type { Category } from "@/lib/types";

type ProductFormValues = {
  sku?: string;
  name?: string;
  brand?: string;
  model_number?: string;
  category_id?: string | null;
  description?: string;
  unit_of_measure?: string;
  currency?: string;
  availability?: string;
  visibility?: string;
  retail_price?: number;
  wholesale_price?: number;
};

const field =
  "w-full rounded border border-neutral-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tronic-red/40 focus:border-tronic-red bg-white";
const label = "block text-sm font-medium text-charcoal-light mb-1";

export function ProductForm({
  action,
  categories,
  values = {},
  submitLabel,
  showWholesale,
}: {
  action: (formData: FormData) => Promise<void>;
  categories: Category[];
  values?: ProductFormValues;
  submitLabel: string;
  showWholesale: boolean;
}) {
  return (
    <form
      action={action}
      className="bg-white border border-neutral-border rounded-lg p-6 space-y-5 max-w-3xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="sku">
            SKU *
          </label>
          <input id="sku" name="sku" required maxLength={64} defaultValue={values.sku} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="name">
            Product name *
          </label>
          <input id="name" name="name" required maxLength={300} defaultValue={values.name} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="brand">
            Brand
          </label>
          <input id="brand" name="brand" maxLength={120} defaultValue={values.brand} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="model_number">
            Model number
          </label>
          <input id="model_number" name="model_number" maxLength={120} defaultValue={values.model_number} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="category_id">
            Category
          </label>
          <select id="category_id" name="category_id" defaultValue={values.category_id ?? ""} className={field}>
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="unit_of_measure">
            Unit of measure
          </label>
          <input id="unit_of_measure" name="unit_of_measure" maxLength={20} defaultValue={values.unit_of_measure ?? "pc"} className={field} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="description">
          Description
        </label>
        <textarea id="description" name="description" rows={4} maxLength={5000} defaultValue={values.description} className={field} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className={label} htmlFor="retail_price">
            Retail price
          </label>
          <input id="retail_price" name="retail_price" type="number" min="0" step="0.01" defaultValue={values.retail_price} className={field} />
        </div>
        {showWholesale && (
          <div>
            <label className={label} htmlFor="wholesale_price">
              Wholesale price{" "}
              <span className="text-[10px] text-tronic-red">(confidential)</span>
            </label>
            <input id="wholesale_price" name="wholesale_price" type="number" min="0" step="0.01" defaultValue={values.wholesale_price} className={field} />
          </div>
        )}
        <div>
          <label className={label} htmlFor="currency">
            Currency
          </label>
          <input id="currency" name="currency" maxLength={3} defaultValue={values.currency ?? "TZS"} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="availability">
            Availability
          </label>
          <select id="availability" name="availability" defaultValue={values.availability ?? "available"} className={field}>
            <option value="available">Available</option>
            <option value="on_request">On request</option>
            <option value="discontinued">Discontinued</option>
          </select>
        </div>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="w-48">
          <label className={label} htmlFor="visibility">
            Visibility
          </label>
          <select id="visibility" name="visibility" defaultValue={values.visibility ?? "draft"} className={field}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <button
          type="submit"
          className="bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-5 py-2 text-sm"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
