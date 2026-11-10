"use client";

import type { OpsBooking, OpsCustomerListItem } from "@nammapros/types";
import { useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import Link from "next/link";
import React, { useMemo, useState } from "react";
import { PhoneActions } from "@/components/ops/ops-contact-actions";
import { DataTable, type OpsColumn } from "@/components/ops/ops-data-table";
import { DetailDrawer } from "@/components/ops/ops-detail-drawer";
import { useBookingDrawer } from "@/components/ops/ops-shell";
import { ErrorState, PageHeader } from "@/components/ops/ops-states";
import { StatusBadge } from "@/components/ops/ops-status-badge";
import { api } from "@/lib/api";
import { formatIstDateTime, formatMoneyPaise } from "@/lib/format";
import { useTableKeyboardShortcuts, useUrlDrawerParam } from "@/lib/hooks";

export function CustomersPage() {
  const [customerId, setCustomerId] = useUrlDrawerParam("customer");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const listQuery = useQuery({
    queryKey: ["ops", "customers", q, page],
    queryFn: () => api.customers({ q, page }),
  });

  const rows = listQuery.data?.results ?? [];

  useTableKeyboardShortcuts({
    rowCount: rows.length,
    selectedIndex,
    onChangeIndex: setSelectedIndex,
    onOpenRow: (idx) => {
      if (rows[idx]) setCustomerId(String(rows[idx].id));
    },
    drawerOpen: Boolean(customerId),
    onCloseDrawer: () => setCustomerId(null),
  });

  const columns: OpsColumn<OpsCustomerListItem>[] = [
    {
      key: "id",
      header: "Customer ID",
      render: (c) => (
        <span className="font-mono text-[12px] font-semibold">
          #{c.id} {c.customer_code ? `(${c.customer_code})` : ""}
        </span>
      ),
    },
    {
      key: "phone",
      header: "Mobile",
      render: (c) => <PhoneActions phone={c.phone} />,
    },
    {
      key: "bookings",
      header: "Bookings",
      align: "right",
      render: (c) => <span className="font-mono font-semibold">{c.bookings}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        subtitle="Customer history, saved booking addresses, payments & support tickets"
        actions={
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--op-muted)]" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search phone or customer code..."
              className="h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] pl-8 pr-2.5 text-[12px]"
            />
          </div>
        }
      />

      {listQuery.isError ? (
        <ErrorState
          message={listQuery.error instanceof Error ? listQuery.error.message : "Could not load customers."}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => String(r.id)}
          loading={listQuery.isLoading}
          selectedIndex={selectedIndex}
          activeRowId={customerId}
          onRowClick={(r, idx) => {
            setSelectedIndex(idx);
            setCustomerId(String(r.id));
          }}
          emptyIcon={Users}
          emptyTitle="No customers matched"
          emptyMessage="Customers appear here after their first booking."
          pagination={
            listQuery.data ? { page, count: listQuery.data.count, onPageChange: setPage } : undefined
          }
        />
      )}

      <CustomerDrawer customerId={customerId} onClose={() => setCustomerId(null)} />
    </div>
  );
}

function CustomerDrawer({ customerId, onClose }: { customerId: string | null; onClose: () => void }) {
  const { openBookingDrawer } = useBookingDrawer();

  const detailQuery = useQuery({
    queryKey: ["ops", "customer", customerId],
    queryFn: () => api.customer(customerId as string),
    enabled: Boolean(customerId),
  });

  const cust = detailQuery.data;

  const uniqueAddresses = useMemo(() => {
    const map = new Map<string, NonNullable<OpsBooking["address"]>>();
    for (const b of cust?.bookings ?? []) {
      if (b.address) {
        const key = `${b.address.line_1}|${b.address.postal_code}`;
        if (!map.has(key)) map.set(key, b.address);
      }
    }
    return Array.from(map.values());
  }, [cust]);

  return (
    <DetailDrawer
      open={Boolean(customerId)}
      onClose={onClose}
      title={cust ? `Customer #${cust.id}` : "Loading customer..."}
      subtitle={cust?.customer_code ? `Code: ${cust.customer_code}` : undefined}
      headerActions={
        cust ? (
          <Link
            href={`/support?customer=${cust.id}`}
            className="rounded bg-[var(--op-brand)] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[var(--op-brand-hover)]"
          >
            + Support Ticket
          </Link>
        ) : undefined
      }
    >
      {detailQuery.isLoading ? (
        <div className="h-32 animate-pulse rounded bg-[var(--op-border)]" />
      ) : detailQuery.isError ? (
        <ErrorState
          message={detailQuery.error instanceof Error ? detailQuery.error.message : "Could not load customer."}
          onRetry={() => void detailQuery.refetch()}
        />
      ) : cust ? (
        <div className="space-y-4">
          <section className="rounded border border-[var(--op-border)] p-3">
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">Contact</h3>
            <PhoneActions phone={cust.phone} />
          </section>

          <section className="rounded border border-[var(--op-border)] p-3 space-y-1.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
              Known Service Addresses ({uniqueAddresses.length})
            </h3>
            {uniqueAddresses.length === 0 ? (
              <p className="text-[12px] text-[var(--op-muted)]">No addresses recorded in booking history.</p>
            ) : (
              uniqueAddresses.map((addr, idx) => (
                <p key={idx} className="text-[12px] text-[var(--op-text)]">
                  {addr.line_1}, {addr.locality}, {addr.city} {addr.postal_code}
                </p>
              ))
            )}
          </section>

          <section className="rounded border border-[var(--op-border)] p-3 space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
              Bookings & Payments ({cust.bookings.length})
            </h3>
            <div className="divide-y divide-[var(--op-border)]">
              {cust.bookings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => openBookingDrawer(b.id)}
                  className="flex w-full items-center justify-between gap-2 py-2 text-left text-[12px] hover:text-[var(--op-brand)]"
                >
                  <div>
                    <span className="font-mono font-semibold">{b.reference}</span> · {b.service}
                    <div className="text-[11px] text-[var(--op-muted)]">{formatIstDateTime(b.start_at)}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono">{formatMoneyPaise(b.price_paise, true)}</span>
                    <StatusBadge status={b.payment_status} />
                    <StatusBadge status={b.status} />
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded border border-[var(--op-border)] p-3 space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
              Support Tickets ({cust.tickets.length})
            </h3>
            {cust.tickets.length === 0 ? (
              <p className="text-[12px] text-[var(--op-muted)]">No support tickets logged.</p>
            ) : (
              <div className="divide-y divide-[var(--op-border)]">
                {cust.tickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/support?ticket=${t.id}`}
                    className="flex items-center justify-between py-2 text-[12px] hover:text-[var(--op-brand)]"
                  >
                    <span>
                      <strong className="font-mono">{t.reference}</strong> · {t.subject}
                    </span>
                    <StatusBadge status={t.status} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </DetailDrawer>
  );
}
