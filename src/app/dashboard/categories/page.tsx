import { requirePermission } from "@/lib/auth/session";
import { listCategories } from "@/modules/products/service";

export const metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requirePermission("products.read");
  const categories = await listCategories();

  const roots = categories.filter((c) => !c.parent_id);
  const children = (parentId: string) =>
    categories.filter((c) => c.parent_id === parentId);

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="display text-2xl font-black">Categories</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Categories are created automatically during product imports and can
          be managed here.
        </p>
      </div>

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Slug</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-charcoal-light py-6">
                  No categories yet — import products to create them.
                </td>
              </tr>
            )}
            {roots.map((root) => (
              <>
                <tr key={root.id}>
                  <td className="font-medium">{root.name}</td>
                  <td className="font-mono text-xs">{root.slug}</td>
                  <td>{root.is_active ? "Yes" : "No"}</td>
                </tr>
                {children(root.id).map((child) => (
                  <tr key={child.id}>
                    <td className="pl-8 text-charcoal-light">↳ {child.name}</td>
                    <td className="font-mono text-xs">{child.slug}</td>
                    <td>{child.is_active ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
