export type OpsRole =
  | "OPERATIONS_VIEWER"
  | "DISPATCH_OPERATOR"
  | "SUPPORT_AGENT"
  | "OPERATIONS_MANAGER"
  | "SUPER_ADMIN";

export type OpsBookingStatus =
  | "DRAFT"
  | "REQUESTED"
  | "AWAITING_PAYMENT"
  | "PENDING_PAYMENT"
  | "PAYMENT_FAILED"
  | "CONFIRMED"
  | "CONFIRMED_UNPAID"
  | "TECHNICIAN_ASSIGNED"
  | "TECHNICIAN_EN_ROUTE"
  | "TECHNICIAN_ARRIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED"
  | "EXPIRED";

export type OpsPage<T> = {
  count: number;
  page: number;
  results: T[];
};

export type OpsBookingAddress = {
  line_1: string;
  locality: string;
  city: string;
  postal_code: string;
};

export type OpsBookingTechnician = {
  id: string;
  name: string;
  phone?: string;
  status: string;
};

export type OpsTicket = {
  id: string;
  reference: string;
  customer_id: number;
  booking_id: string | null;
  category: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" | string;
  subject: string;
  description: string;
  status: "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | string;
  assigned_to: number | null;
  created_at: string;
  updated_at?: string;
  events?: {
    kind: string;
    text: string;
    from_status: string;
    to_status: string;
    created_at: string;
  }[];
};

export type OpsBooking = {
  id: string;
  reference: string;
  booking_number?: string;
  work_order_number?: string;
  invoice_number?: string;
  customer_code?: string;
  version: number;
  status: string;
  priority: string;
  payment_status: string;
  customer_id: number;
  customer_phone: string;
  customer_name: string;
  service: string;
  package: string;
  service_id?: string;
  zone_id?: string | null;
  zone: string;
  start_at: string;
  end_at: string | null;
  problem_description?: string;
  closed_at?: string | null;
  address: OpsBookingAddress | null;
  price_paise: number | null;
  advance_paise?: number;
  offline_collected_paise?: number;
  balance_due_paise?: number;
  price_lines: { code?: string; name?: string; amount_paise: number; quantity?: number; unit_paise?: number }[];
  technician: OpsBookingTechnician | null;
  timeline?: { status: string; at: string; reason: string }[];
  notes?: { id?: string; text: string; at: string }[];
  support?: OpsTicket[];
};

export type OpsTechnician = {
  id: string;
  name: string;
  status: string;
  online: boolean;
  skills: string[];
  zones: string[];
  active_jobs: number;
  availability?: { weekday: number; start_minute: number; end_minute: number }[];
  time_off?: { start_at: string; end_at: string; reason: string }[];
  jobs?: { booking_id: string; status: string; start_at: string }[];
  notes?: { text: string; at: string }[];
};

export type OpsEscalation = {
  id: string;
  booking_id: string | null;
  ticket_id: string | null;
  category: string;
  priority: "NORMAL" | "HIGH" | "URGENT" | string;
  status: "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | string;
  assigned_to: number | null;
  notes: string;
  resolution: string;
  created_at: string;
};

export type OpsCandidate = {
  id: string;
  name: string;
  score: number;
  workload: number;
  reasons: string[];
};

export type OpsDispatchAttempt = {
  id: string;
  technician: string;
  status: string;
  mode: string;
  created_at: string;
};

export type OpsDashboard = {
  start: string;
  end: string;
  metrics: Record<string, number>;
  recent_bookings: OpsBooking[];
  upcoming_appointments: OpsBooking[];
  urgent_escalations: OpsEscalation[];
  distribution: { status: string; count: number }[];
  alerts: { event: string; reference: string; created_at: string }[];
  sla_warnings: { code: string; deadline_at: string; booking_id: string | null }[];
};

export type OpsLead = {
  id: string;
  lead_reference: string;
  customer_name: string;
  mobile_number: string;
  alternate_mobile: string;
  email: string;
  service_category_id: string;
  service_category: string;
  service_id: string;
  service: string;
  service_price_paise?: number;
  service_items?: { service_id: string; quantity: number }[];
  quoted_amount_paise?: number;
  advance_amount_paise?: number;
  manual_paid_paise?: number;
  payment_status?: string;
  payment_link_url?: string;
  zone_id: string | null;
  zone_name?: string | null;
  problem_description: string;
  address: string;
  landmark: string;
  area: string;
  city: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  preferred_date: string | null;
  preferred_time: string | null;
  urgency: string;
  source: string;
  status: string;
  priority: string;
  assigned_to: number | null;
  assigned_to_phone: string | null;
  follow_up_at: string | null;
  internal_notes: string;
  converted_booking_id: string | null;
  created_at: string;
  updated_at?: string;
  activities?: { kind: string; detail: Record<string, unknown>; created_at: string; actor_id: number }[];
  follow_ups?: { id: string; due_at: string; notes: string; assigned_to: number; completed_at: string | null }[];
};

export type OpsLeadSummary = {
  total: number;
  new: number;
  follow_ups_due: number;
  qualified: number;
  converted: number;
  conversion_rate: number;
};

export type OpsLeadFollowUpItem = {
  id: string;
  lead_id: string;
  lead_reference: string;
  customer_name: string;
  mobile_number?: string;
  due_at: string;
  notes: string;
  assigned_to?: number | null;
  completed_at: string | null;
};

export type OpsConversionPackage = {
  id: string;
  name: string;
  payment_policy: string;
  total_paise: number;
  slots: { id: string; start_at: string; remaining: number }[];
};

export type OpsCustomerListItem = {
  id: number;
  customer_code?: string;
  phone: string;
  bookings: number;
};

export type OpsCustomerDetail = {
  id: number;
  customer_code?: string;
  phone: string;
  bookings: OpsBooking[];
  tickets: OpsTicket[];
};

export type OpsScheduleResponse = {
  start: string;
  end: string;
  bookings: OpsBooking[];
  available_slots: { id: string; start_at: string; zone: string; package: string; remaining: number }[];
  conflicts: { first: string; second: string }[];
};

export type OpsReportsResponse = {
  start?: string;
  end?: string;
  denominator?: string;
  total: number;
  assignment_rate: number;
  cancellation_rate: number;
  completion_rate: number;
  sla_breaches: number;
  support_tickets: number;
  by_date: { created_at__date: string; count: number }[];
  by_service: { service__name: string; count: number }[];
  by_zone: { slot__zone__name: string; count: number }[];
  technician_utilization: { id: string; display_name: string; completed: number; utilization_rate: number | null }[];
};

export type OpsDispatchRule = {
  id?: string;
  name: string;
  is_active: boolean;
  automatic_enabled: boolean;
  offer_timeout_minutes: number;
  maximum_attempts: number;
  travel_buffer_minutes: number;
  weight_workload: number;
  weight_availability: number;
};

export type OpsSlaPolicy = {
  id?: string;
  code: string;
  duration_minutes: number;
  warning_minutes: number;
  is_active: boolean;
};

export type OpsSettingsResponse = {
  dispatch: OpsDispatchRule | null;
  sla: OpsSlaPolicy[];
};
