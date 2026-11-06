import type { Service } from "@nammapros/types";
import { ArrowUpRight, Wrench } from "lucide-react";
import Link from "next/link";
import { formatStartingPrice, serviceIcons } from "@/lib/services";

export function ServiceCard({ service }: { service: Service }) {
  const Icon = serviceIcons[service.slug] ?? Wrench;
  return <article className="service-card"><div className="service-icon"><Icon size={27} strokeWidth={1.8}/></div><div className="service-card-body"><h3>{service.name}</h3><p>{service.summary}</p><span className="price-note">{formatStartingPrice(service)}</span></div><Link href={`/book?service=${encodeURIComponent(service.slug)}`} className="service-card-action" aria-label={`Start booking ${service.name}`}>Book <ArrowUpRight size={17}/></Link></article>;
}
