"use client";

import { useRouter } from "next/navigation";
import { PERMISSIONS } from "@cartforge/types";
import { Alert, useToast } from "@cartforge/ui";
import { ProductForm } from "@/components/products/product-form";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";
import { useCreateProduct } from "@/lib/products";
import { useSession } from "@/lib/session";

export default function NewProductPage() {
  useBreadcrumbTitle("Add product");
  const router = useRouter();
  const toast = useToast();
  const { can } = useSession();
  const create = useCreateProduct();

  if (!can(PERMISSIONS.PRODUCTS_WRITE)) {
    return <Alert tone="info" title="You don't have permission to add products." />;
  }

  return (
    <ProductForm
      onCreate={async (body) => {
        try {
          const product = await create.mutateAsync(body);
          toast.success("Product created");
          router.replace(`/admin/products/${product.id}`);
          return { ok: true, product };
        } catch (error) {
          return { ok: false, error };
        }
      }}
    />
  );
}
