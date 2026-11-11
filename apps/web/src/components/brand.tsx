import Image from "next/image";
import Link from "next/link";

export function Brand({
  compact = false,
  variant = "light",
}: {
  compact?: boolean;
  variant?: "light" | "dark";
}) {
  const src =
    variant === "dark"
      ? "/images/brand/nammapros-wordmark-dark-v2.png"
      : "/images/brand/nammapros-wordmark-v2.png";

  return (
    <Link
      href="/"
      className="brand inline-flex shrink-0 items-center"
      aria-label="nammapros home"
    >
      <Image
        src={src}
        alt="nammapros."
        width={compact ? 154 : 184}
        height={compact ? 32 : 38}
        priority
        unoptimized
        className={`${compact ? "h-7 sm:h-8" : "h-8 sm:h-9"} w-auto object-contain`}
      />
    </Link>
  );
}
