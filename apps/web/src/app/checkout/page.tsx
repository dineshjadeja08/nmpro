import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout-view";
import { getCatalog } from "@/lib/catalog";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const { service } = await searchParams;
  // Only needed when a "Book" link names a service to put in the cart.
  const services = service ? (await getCatalog()).data?.services ?? [] : [];
  return (
    <main className="min-h-[70vh] bg-[#FBF8F5] py-6 sm:py-8">
      <div className="container">
        <h1 className="mb-5 text-2xl font-bold text-[#1C1917]">Checkout</h1>
        <CheckoutView services={services} requestedService={service} />
      </div>
    </main>
  );
}
