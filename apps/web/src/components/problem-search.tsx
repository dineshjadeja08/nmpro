"use client";

import { problemSuggestions } from "@nammapros/config";
import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const COMMON_PROBLEM_CHIPS = problemSuggestions.slice(0, 6);

export function ProblemSearch({
  compact = false,
  showChips = false,
}: {
  compact?: boolean;
  showChips?: boolean;
}) {
  const [query, setQuery] = useState("");
  const cleanQuery = query.toLowerCase().trim();

  const suggestions = useMemo(
    () => problemSuggestions.filter((item) => item.label.toLowerCase().includes(cleanQuery)),
    [cleanQuery]
  );

  const showDropdown = !showChips || cleanQuery.length > 0;

  return (
    <div className={`problem-search ${compact ? "problem-search--compact" : ""}`}>
      {!showChips && (
        <label htmlFor={compact ? "problem-search-compact" : "problem-search"}>What needs fixing?</label>
      )}
      <div className="problem-search-input">
        <Search size={20} strokeWidth={1.5} />
        <input
          id={compact ? "problem-search-compact" : "problem-search"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try ‘AC not cooling’"
          autoComplete="off"
        />
      </div>

      {showChips && (
        <div className="mt-3.5 flex flex-wrap gap-2" aria-label="Common home problems">
          {COMMON_PROBLEM_CHIPS.map((item) => (
            <Link
              key={item.label}
              href={`/book?service=${encodeURIComponent(item.serviceSlug)}&problem=${encodeURIComponent(item.label)}`}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-[#1C1917] shadow-[0_4px_14px_rgba(28,25,23,0.05)] transition hover:bg-[#f5ebe8] hover:text-[#800020]"
            >
              <span>{item.label}</span>
              <ArrowUpRight size={13} strokeWidth={1.5} className="text-[#800020]" />
            </Link>
          ))}
        </div>
      )}

      {showDropdown && (
        <div className="suggestions" aria-live="polite">
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
            <p>
              No exact suggestion. <Link href="/services">Browse all services</Link> or describe the problem in booking.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
