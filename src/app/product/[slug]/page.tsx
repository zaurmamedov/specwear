import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductDetails } from "@/components/ProductDetails/ProductDetails";
import { getProductBySlug } from "@/services/products.service";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return {
      title: "Товар не знайдено",
    };
  }

  return {
    title: product.name,
    description: product.seo_description ?? product.short_description ?? undefined,
  };
}

export default async function ProductSlugPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  return <ProductDetails product={product} />;
}
