"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PackageX } from "lucide-react";
import { Alert, Button, Card, ConfirmDialog, EmptyState, Skeleton, useToast } from "@cartforge/ui";
import { ProductForm } from "@/components/products/product-form";
import { ProductMarketsCard } from "@/components/products/product-markets";
import { ApiError } from "@/lib/api-client";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";
import { lastListUrl, useDeleteProduct, useProduct, useUpdateProduct } from "@/lib/products";

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const router = useRouter();
  const toast = useToast();
  const product = useProduct(productId);
  const update = useUpdateProduct(productId);
  const del = useDeleteProduct();
  const [confirmDelete, setConfirmDelete] = useState(false);
  useBreadcrumbTitle(product.data?.title);

  if (product.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (product.isError) {
    if (product.error instanceof ApiError && product.error.status === 404) {
      return (
        <Card>
          <EmptyState
            icon={<PackageX />}
            title="Product not found"
            description="It may have been deleted, or it belongs to a different store."
            action={
              <Button asChild variant="secondary">
                <Link href={lastListUrl()}>Back to products</Link>
              </Button>
            }
          />
        </Card>
      );
    }
    return (
      <Alert
        tone="danger"
        title="Couldn't load this product"
        action={
          <Button size="sm" variant="secondary" onClick={() => product.refetch()}>
            Retry
          </Button>
        }
      >
        {product.error.message}
      </Alert>
    );
  }

  return (
    <>
      <ProductForm
        key={product.data.id}
        product={product.data}
        onUpdate={async (body) => {
          try {
            const updated = await update.mutateAsync(body);
            toast.success("Product saved");
            return { ok: true, product: updated };
          } catch (error) {
            return { ok: false, error };
          }
        }}
        onDelete={() => setConfirmDelete(true)}
      />
      <ProductMarketsCard productId={product.data.id} />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete product?"
        description={`"${product.data.title}" will be removed from your catalog. Past orders keep their copy of the product details.`}
        confirmLabel="Delete product"
        destructive
        pending={del.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          del.mutate(product.data.id, {
            onSuccess: () => {
              toast.success("Product deleted");
              router.replace(lastListUrl());
            },
            onError: (err) => {
              setConfirmDelete(false);
              toast.error(err.message);
            },
          })
        }
      />
    </>
  );
}
