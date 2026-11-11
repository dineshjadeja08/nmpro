"use client";

import type { Service } from "@nammapros/types";
import React, { useEffect, useState } from "react";
import { ServiceCard } from "@/components/service-card";
import { ServiceDetailModal } from "@/components/service-detail-modal";

export function ServiceCatalogGrid({
  services,
  gridClassName = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
}: {
  services: Service[];
  gridClassName?: string;
}) {
  const [modalService, setModalService] = useState<Service | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || services.length === 0) return;
    const targetSlug = new URLSearchParams(window.location.search).get("service");
    if (!targetSlug) return;
    const match = services.find((s) => s.slug === targetSlug);
    if (!match) return;
    const timer = window.setTimeout(() => {
      setModalService(match);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [services]);

  return (
    <>
      <div className={gridClassName}>
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} onQuickView={setModalService} />
        ))}
      </div>

      {modalService && (
        <ServiceDetailModal
          service={modalService}
          onClose={() => setModalService(null)}
        />
      )}
    </>
  );
}
