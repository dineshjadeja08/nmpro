import type { Metadata } from "next";
import Link from "next/link";
import { ProblemSearch } from "@/components/problem-search";
export const metadata: Metadata = { title: "Search by problem", robots: { index: false, follow: false } };
export default function SearchPage() { return <main className="container search-page"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link> / Search</nav><span className="section-kicker">PROBLEM-BASED DISCOVERY</span><h1>What’s happening at home?</h1><p>Start with a familiar symptom. These suggestions are local guidance, not a diagnosis.</p><ProblemSearch/></main>; }
