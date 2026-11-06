import Link from "next/link";
export default function NotFound() { return <main className="container simple-page"><h1>Page not found</h1><p>We couldn’t find that page.</p><Link className="button button-primary page-actions" href="/">Return home</Link></main>; }
