import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand" aria-label="nammapros home"><span><strong>namma<span>pros.</span></strong>{!compact && <small>Your Home. Our Expertise.</small>}</span></Link>;
}
