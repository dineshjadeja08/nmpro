"use client";

import { problemSuggestions } from "@nammapros/config";
import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export function ProblemSearch({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const suggestions = useMemo(() => problemSuggestions.filter(item => item.label.toLowerCase().includes(query.toLowerCase().trim())), [query]);
  return <div className={`problem-search ${compact ? "problem-search--compact" : ""}`}>
    <label htmlFor={compact ? "problem-search-compact" : "problem-search"}>What needs fixing?</label>
    <div className="problem-search-input"><Search size={21}/><input id={compact ? "problem-search-compact" : "problem-search"} value={query} onChange={e => setQuery(e.target.value)} placeholder="Try ‘AC not cooling’" autoComplete="off" /></div>
    <div className="suggestions" aria-live="polite">{suggestions.length ? suggestions.map(item => <Link key={item.label} href={`/book?service=${item.serviceSlug}&problem=${encodeURIComponent(item.label)}`}><span>{item.label}</span><ArrowUpRight size={16}/></Link>) : <p>No exact suggestion. <Link href="/services">Browse all services</Link> or describe the problem in booking.</p>}</div>
  </div>;
}
