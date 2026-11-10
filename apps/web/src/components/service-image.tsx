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
};

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
  fit = "cover",
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
        borderRadius: "10px",
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
        sizes={sizes}
        style={{ objectFit: fit }}
        className={imageClassName}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
