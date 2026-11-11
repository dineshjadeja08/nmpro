"use client";

import Image from "next/image";
import { useState } from "react";
import { resolveUploadedMediaUrl } from "@/lib/service-images";

type ServiceImageProps = {
  fit?: "cover" | "contain";
  src?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  sizes?: string;
  zoomOnHover?: boolean;
};

const WARM_BLUR_DATA_URL =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 6'%3E%3Crect width='8' height='6' fill='%23F4EFE9'/%3E%3C/svg%3E";

function isLocalBackendImage(src?: string | null) {
  return Boolean(src?.startsWith("http://127.0.0.1:8000/") || src?.startsWith("http://localhost:8000/"));
}

export function ServiceImage({
  src,
  alt,
  className,
  imageClassName,
  priority,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  fit = "contain",
  zoomOnHover = true,
}: ServiceImageProps) {
  const [failed, setFailed] = useState(false);
  const imageSrc = failed ? null : resolveUploadedMediaUrl(src);

  // Strict rule: if no admin-uploaded image exists, render nothing.
  if (!imageSrc) {
    return null;
  }

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "8px",
        ...(className ? {} : { width: "100%", height: "100%" }),
      }}
      className={className}
    >
      <Image
        src={imageSrc}
        alt={alt}
        fill
        priority={priority}
        unoptimized={isLocalBackendImage(imageSrc)}
        placeholder="blur"
        blurDataURL={WARM_BLUR_DATA_URL}
        sizes={sizes}
        style={{ objectFit: fit }}
        className={`${zoomOnHover ? "transition-transform duration-300 ease-out group-hover:scale-[1.03]" : ""} ${imageClassName || ""}`}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
