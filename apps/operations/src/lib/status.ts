import type { OpsBooking } from "@nammapros/types";

export type StatusTone =
  | "amber"
  | "blue"
  | "yellow"
  | "indigo"
  | "violet"
  | "orange"
  | "green"
  | "zinc"
  | "red";

export type StatusMeta = {
  label: string;
  tone: StatusTone;
  badgeClass: string;
  dotColor: string;
};

const TONE_CLASSES: Record<StatusTone, { badgeClass: string; dotColor: string }> = {
  amber: {
    badgeClass: "bg-amber-100 text-amber-900 border-amber-200",
    dotColor: "#D97706",
  },
  blue: {
    badgeClass: "bg-blue-100 text-blue-900 border-blue-200",
    dotColor: "#2563EB",
  },
  yellow: {
    badgeClass: "bg-yellow-100 text-yellow-900 border-yellow-300",
    dotColor: "#CA8A04",
  },
  indigo: {
    badgeClass: "bg-indigo-100 text-indigo-900 border-indigo-200",
    dotColor: "#4F46E5",
  },
  violet: {
    badgeClass: "bg-violet-100 text-violet-900 border-violet-200",
    dotColor: "#7C3AED",
  },
  orange: {
    badgeClass: "bg-orange-100 text-orange-900 border-orange-200",
    dotColor: "#EA580C",
  },
  green: {
    badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-200",
    dotColor: "#059669",
  },
  zinc: {
    badgeClass: "bg-zinc-200 text-zinc-800 border-zinc-300",
    dotColor: "#52525B",
  },
  red: {
    badgeClass: "bg-red-100 text-red-900 border-red-200",
    dotColor: "#DC2626",
  },
};

const STATUS_TONE_BY_KEY: Record<string, { tone: StatusTone; label?: string }> = {
  // Booking / Dispatch / Job statuses
  AWAITING_PAYMENT: { tone: "amber", label: "Pending payment" },
  PENDING_PAYMENT: { tone: "amber", label: "Pending payment" },
  PENDING: { tone: "amber", label: "Pending" },
  CONFIRMED: { tone: "blue", label: "Confirmed" },
  CONFIRMED_UNPAID: { tone: "blue", label: "Confirmed (Pay at visit)" },
  REQUESTED: { tone: "blue", label: "Requested" },
  OFFERED: { tone: "yellow", label: "Offered" },
  TECHNICIAN_ASSIGNED: { tone: "indigo", label: "Assigned" },
  ASSIGNED: { tone: "indigo", label: "Assigned" },
  TECHNICIAN_EN_ROUTE: { tone: "violet", label: "En route" },
  EN_ROUTE: { tone: "violet", label: "En route" },
  TECHNICIAN_ARRIVED: { tone: "violet", label: "Arrived" },
  ARRIVED: { tone: "violet", label: "Arrived" },
  IN_PROGRESS: { tone: "orange", label: "In progress" },
  INSPECTING: { tone: "orange", label: "Inspecting" },
  AWAITING_QUOTATION_APPROVAL: { tone: "orange", label: "Quotation pending" },
  COMPLETED: { tone: "green", label: "Completed" },
  SERVICE_COMPLETED: { tone: "green", label: "Completed" },
  CLOSED: { tone: "green", label: "Closed" },
  CANCELLED: { tone: "zinc", label: "Cancelled" },
  EXPIRED: { tone: "zinc", label: "Expired" },
  WITHDRAWN: { tone: "zinc", label: "Withdrawn" },
  PAYMENT_FAILED: { tone: "red", label: "Payment failed" },
  FAILED: { tone: "red", label: "Failed" },
  DECLINED: { tone: "red", label: "Declined" },
  EXCEPTIONS: { tone: "red", label: "Exception" },

  // Payment statuses
  PAID: { tone: "green", label: "Paid" },
  ADVANCE_PAID: { tone: "indigo", label: "Advance paid" },
  PARTIALLY_PAID: { tone: "blue", label: "Partially paid" },
  UNPAID: { tone: "zinc", label: "Unpaid" },
  LINK_SENT: { tone: "amber", label: "Link sent" },
  REFUND_PENDING: { tone: "amber", label: "Refund pending" },
  NOT_REQUIRED: { tone: "zinc", label: "Not required" },

  // Lead statuses
  NEW: { tone: "yellow", label: "New" },
  CONTACTED: { tone: "blue", label: "Contacted" },
  FOLLOW_UP: { tone: "orange", label: "Interested / Follow-up" },
  QUALIFIED: { tone: "indigo", label: "Scheduled / Qualified" },
  CONVERTED: { tone: "green", label: "Converted" },
  LOST: { tone: "zinc", label: "Lost" },

  // Support / Escalation / Priority / Tech verification
  OPEN: { tone: "red", label: "Open" },
  ACKNOWLEDGED: { tone: "indigo", label: "Acknowledged" },
  RESOLVED: { tone: "green", label: "Resolved" },
  VERIFIED: { tone: "green", label: "Verified" },
  ACTIVE: { tone: "green", label: "Active" },
  ONLINE: { tone: "green", label: "Online" },
  OFFLINE: { tone: "zinc", label: "Offline" },
  UNDER_REVIEW: { tone: "amber", label: "Under review" },
  PENDING_DOCUMENTS: { tone: "amber", label: "Pending docs" },
  SUSPENDED: { tone: "red", label: "Suspended" },
  REJECTED: { tone: "red", label: "Rejected" },
  LOW: { tone: "zinc", label: "Low" },
  NORMAL: { tone: "blue", label: "Normal" },
  SOON: { tone: "amber", label: "Soon" },
  HIGH: { tone: "orange", label: "High" },
  URGENT: { tone: "red", label: "Urgent" },
  BREACHED: { tone: "red", label: "Breached" },
  AT_RISK: { tone: "amber", label: "At risk" },
  ON_TRACK: { tone: "green", label: "On track" },
};

export function formatStatusLabel(status: string): string {
  if (!status) return "—";
  const mapped = STATUS_TONE_BY_KEY[status.toUpperCase()];
  if (mapped?.label) return mapped.label;
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

export function getStatusMeta(status: string): StatusMeta {
  const key = (status || "").toUpperCase();
  const entry = STATUS_TONE_BY_KEY[key] ?? { tone: "zinc" as StatusTone };
  const toneStyles = TONE_CLASSES[entry.tone];
  return {
    label: formatStatusLabel(status),
    tone: entry.tone,
    badgeClass: toneStyles.badgeClass,
    dotColor: toneStyles.dotColor,
  };
}

/**
 * Mirrors ALLOWED_CUSTOMER_TRANSITIONS from services/api/domains/bookings/states.py
 */
export const ALLOWED_BOOKING_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["REQUESTED", "CONFIRMED_UNPAID", "AWAITING_PAYMENT", "PENDING_PAYMENT"],
  REQUESTED: ["CONFIRMED", "CONFIRMED_UNPAID", "CANCELLED"],
  AWAITING_PAYMENT: ["CONFIRMED", "EXPIRED", "CANCELLED"],
  PENDING_PAYMENT: ["CONFIRMED", "EXPIRED", "CANCELLED", "PAYMENT_FAILED"],
  PAYMENT_FAILED: ["AWAITING_PAYMENT", "PENDING_PAYMENT", "CONFIRMED", "CANCELLED"],
  CONFIRMED: ["TECHNICIAN_ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
  CONFIRMED_UNPAID: ["CONFIRMED", "CONFIRMED_UNPAID", "TECHNICIAN_ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
  TECHNICIAN_ASSIGNED: ["TECHNICIAN_EN_ROUTE", "IN_PROGRESS", "CANCELLED"],
  TECHNICIAN_EN_ROUTE: ["TECHNICIAN_ARRIVED", "IN_PROGRESS", "CANCELLED"],
  TECHNICIAN_ARRIVED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export type BookingActionAvailability = {
  canOffer: boolean;
  canAssign: boolean;
  canReassign: boolean;
  canReschedule: boolean;
  canCancel: boolean;
  canConfirm: boolean;
  canStart: boolean;
  canComplete: boolean;
  canRecordBalance: boolean;
  reasons: Partial<Record<
    "offer" | "assign" | "reassign" | "reschedule" | "cancel" | "confirm" | "start" | "complete" | "recordBalance",
    string
  >>;
};

export function getBookingAllowedActions(booking: Pick<OpsBooking, "status" | "payment_status" | "balance_due_paise" | "technician">): BookingActionAvailability {
  const status = (booking.status || "").toUpperCase();
  const assignmentStatus = (booking.technician?.status || "").toUpperCase();
  const transitions = ALLOWED_BOOKING_TRANSITIONS[status] ?? [];
  const hasTech = Boolean(booking.technician);
  const terminal = ["COMPLETED", "CLOSED", "CANCELLED", "EXPIRED"].includes(status);
  const dispatchEligible = ["REQUESTED", "CONFIRMED", "CONFIRMED_UNPAID"].includes(status);

  const canOffer = !hasTech && dispatchEligible;
  const canAssign = !hasTech && dispatchEligible;
  const canReassign =
    hasTech &&
    ["CONFIRMED", "CONFIRMED_UNPAID", "TECHNICIAN_ASSIGNED", "TECHNICIAN_EN_ROUTE"].includes(status) &&
    !["ARRIVED", "INSPECTING", "AWAITING_QUOTATION_APPROVAL", "IN_PROGRESS", "SERVICE_COMPLETED", "CANCELLED"].includes(assignmentStatus);
  const canReschedule = status === "CONFIRMED_UNPAID";
  const canCancel = transitions.includes("CANCELLED") && !terminal;
  const canConfirm = ["REQUESTED", "AWAITING_PAYMENT", "PENDING_PAYMENT", "PAYMENT_FAILED", "CONFIRMED_UNPAID"].includes(status);
  const canStart = transitions.includes("IN_PROGRESS") && !terminal;
  const canComplete = transitions.includes("COMPLETED") && !terminal;
  const canRecordBalance = booking.payment_status !== "PAID" && (booking.balance_due_paise ?? 0) > 0 && !["CANCELLED", "EXPIRED"].includes(status);

  const reasons: BookingActionAvailability["reasons"] = {};
  if (!canOffer) reasons.offer = hasTech ? "Already assigned" : `Offers unavailable in ${formatStatusLabel(status)}`;
  if (!canAssign) reasons.assign = hasTech ? "Use Reassign instead" : `Assignment unavailable in ${formatStatusLabel(status)}`;
  if (!canReassign) reasons.reassign = !hasTech ? "No technician assigned yet" : "Cannot reassign after arrival or completion";
  if (!canReschedule) reasons.reschedule = "Operations reschedule applies to active Pay-at-visit bookings";
  if (!canCancel) reasons.cancel = `Cannot cancel in ${formatStatusLabel(status)}`;
  if (!canConfirm) reasons.confirm = `Booking is already ${formatStatusLabel(status)}`;
  if (!canStart) reasons.start = `Cannot start in ${formatStatusLabel(status)}`;
  if (!canComplete) reasons.complete = `Cannot complete in ${formatStatusLabel(status)}`;
  if (!canRecordBalance) reasons.recordBalance = booking.payment_status === "PAID" ? "Payment already settled" : "No unpaid balance due";

  return {
    canOffer,
    canAssign,
    canReassign,
    canReschedule,
    canCancel,
    canConfirm,
    canStart,
    canComplete,
    canRecordBalance,
    reasons,
  };
}

export type SlaSeverity = "ON_TRACK" | "AT_RISK" | "BREACHED" | "NONE";

export type SlaEvaluation = {
  severity: SlaSeverity;
  label: string;
  remainingMs: number | null;
};

export function evaluateSlaDeadline(deadlineAt: string | null | undefined, nowMs: number): SlaEvaluation {
  if (!deadlineAt) {
    return { severity: "NONE", label: "—", remainingMs: null };
  }
  const targetMs = new Date(deadlineAt).getTime();
  if (!Number.isFinite(targetMs)) {
    return { severity: "NONE", label: "—", remainingMs: null };
  }
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) {
    const overdueMin = Math.max(1, Math.floor(Math.abs(diffMs) / 60000));
    const hrs = Math.floor(overdueMin / 60);
    const mins = overdueMin % 60;
    return {
      severity: "BREACHED",
      label: hrs > 0 ? `Breached ${hrs}h ${mins}m` : `Breached ${overdueMin}m`,
      remainingMs: diffMs,
    };
  }
  const totalSec = Math.floor(diffMs / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (diffMs < 30 * 60 * 1000) {
    return {
      severity: "AT_RISK",
      label: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
      remainingMs: diffMs,
    };
  }
  return {
    severity: "ON_TRACK",
    label: hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`,
    remainingMs: diffMs,
  };
}

export function getEffectiveSlaDeadline(booking: Pick<OpsBooking, "status" | "start_at">, explicitDeadline?: string | null): string | null {
  if (explicitDeadline) return explicitDeadline;
  const status = (booking.status || "").toUpperCase();
  if (["COMPLETED", "CLOSED", "CANCELLED", "EXPIRED"].includes(status)) {
    return null;
  }
  return booking.start_at || null;
}
