import type { Metadata } from "next";
import Link from "next/link";
import { ServiceCard } from "@/components/service-card";
import { getCatalog } from "@/lib/catalog";

export const metadata: Metadata = { title: "Home services", description: "Explore NammaPros home services and start with the work you need.", alternates: { canonical: "/services" } };
export default async function ServicesPage() {
  const { data, error } = await getCatalog();
  return <main><section className="inner-hero"><div className="container"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link> / Services</nav><span className="section-kicker">OUR SERVICE CATALOG</span><h1>Find the right help for your home.</h1><p>Start with a service below, or search by problem. Appointment options appear only where configured.</p></div></section><section className="container listing-section">{error ? <div className="status-panel" role="alert"><h2>Catalog unavailable</h2><p>{error}</p></div> : data?.services.length ? <div className="listing-grid">{data.services.map(service => <ServiceCard key={service.id} service={service}/>)}</div> : <div className="status-panel"><h2>No services published</h2><p>Check back after catalog setup.</p></div>}{data?.demo && <p className="demo-note">Demonstration catalog. Prices, zones and appointments have not been configured.</p>}</section></main>;
}
