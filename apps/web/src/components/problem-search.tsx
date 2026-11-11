"use client";

import { problemSuggestions } from "@nammapros/config";
import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const COMMON_PROBLEM_CHIPS = problemSuggestions.slice(0, 6);

export function ProblemSearch({
  compact = false,
  showChips = false,
}: {
  compact?: boolean;
  showChips?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const cleanQuery = query.toLowerCase().trim();

  const suggestions = useMemo(
    () => problemSuggestions.filter((item) => item.label.toLowerCase().includes(cleanQuery)),
    [cleanQuery]
  );

  const showDropdown = !showChips || cleanQuery.length > 0;

  function handleFindPro(e: React.FormEvent) {
    e.preventDefault();
    const topMatch = suggestions[0];
    if (topMatch) {
      router.push(`/book?service=${encodeURIComponent(topMatch.serviceSlug)}&problem=${encodeURIComponent(query.trim() || topMatch.label)}`);
    } else if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push("/services");
    }
  }

  return (
    <div className={`problem-search ${compact ? "problem-search--compact" : ""}`}>
      {!showChips && (
        <label htmlFor={compact ? "problem-search-compact" : "problem-search"}>What needs fixing?</label>
      )}

      <form
        onSubmit={handleFindPro}
        className="flex items-center gap-2 rounded-lg border border-[#E2D9D0] bg-white p-1.5 pl-3.5 shadow-[0_8px_28px_rgba(28,25,23,0.06)] focus-within:border-[#800020]"
      >
        <Search size={18} strokeWidth={1.5} className="shrink-0 text-[#78716C]" />
        <input
          id={compact ? "problem-search-compact" : "problem-search"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try ‘AC not cooling’"
          autoComplete="off"
          className="h-10 min-w-0 flex-1 border-0 bg-transparent text-sm text-[#1C1917] outline-none placeholder:text-[#78716C]"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-[#800020] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#5e0017]"
        >
          Find a pro
        </button>
      </form>

      {showChips && (
        <div className="mt-3.5 flex flex-wrap gap-2" aria-label="Common home problems">
          {COMMON_PROBLEM_CHIPS.map((item) => (
            <Link
              key={item.label}
              href={`/book?service=${encodeURIComponent(item.serviceSlug)}&problem=${encodeURIComponent(item.label)}`}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-[#E8E1DB] bg-white px-3.5 py-1 text-xs font-medium text-[#1C1917] shadow-2xs transition hover:border-[#800020] hover:bg-[#f5ebe8] hover:text-[#800020]"
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      )}

      {showDropdown && (
        <div className="suggestions mt-2 rounded-lg border border-[#E8E1DB] bg-white shadow-md" aria-live="polite">
          {suggestions.length ? (
            suggestions.map((item) => (
              <Link
                key={item.label}
                href={`/book?service=${item.serviceSlug}&problem=${encodeURIComponent(item.label)}`}
              >
                <span>{item.label}</span>
                <ArrowUpRight size={16} strokeWidth={1.5} />
              </Link>
            ))
          ) : (
            <p className="p-3 text-xs text-[#57534E]">
              No exact suggestion. <Link href="/services" className="font-bold text-[#800020]">Browse all services</Link> or describe the problem in booking.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
