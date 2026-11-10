import React from "react";
import { AlertTriangle } from "lucide-react";

export function AdminErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-red-700 shrink-0" />
        <div>
          <h3 className="text-sm font-bold text-red-950">Could not load this admin view</h3>
          <p className="mt-1 text-sm text-red-800">{message}</p>
          {onRetry ? (
            <button
              type="button"
              className="mt-3 inline-flex items-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-800 hover:bg-red-50 transition"
              onClick={onRetry}
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
