/**
 * Materials order types.
 *
 * IMPORTANT: All monetary values are integer cents (USD).
 * $21.50 = 2150. Never use floats.
 *
 * baseTotal = partner's price. The customer pays a marked-up amount.
 * The markup is NEVER shown in the partner portal.
 */

export type OrderStatus =
  | "NEW"
  | "FUNDED"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "PICKED_UP"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURN_CONFIRMED"
  | "RETURN_REJECTED";

export interface OrderContractor {
  id: string;
  /** First name + last initial only (e.g. "James K.") */
  name: string;
  phone: string;
  photoUrl?: string;
}

export interface OrderLineItem {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  /** Unit price in USD cents */
  unitPrice: number;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  timestamp: string;
  note?: string;
}

export interface ReturnRequest {
  initiatedBy: "CUSTOMER" | "CONTRACTOR";
  reason?: string;
  photoUrls: string[];
  lineItems: { lineItemId: string; quantity: number }[];
  createdAt: string;
}

export interface MaterialsOrder {
  id: string;
  /** e.g. "MAT-2026-0042" */
  reference: string;
  /** e.g. "JOB-1234" */
  jobReference: string;
  jobType: string;
  contractor: OrderContractor;
  lineItems: OrderLineItem[];
  /** Partner's base total in USD cents */
  baseTotal: number;
  status: OrderStatus;
  statusHistory: StatusHistoryEntry[];
  pickupCode?: string;
  pickupCodeExpiresAt?: string;
  returnRequest?: ReturnRequest;
  locationId: string;
  createdAt: string;
  updatedAt: string;
}

export type OrderTabFilter = "ACTIVE" | "COMPLETED" | "RETURNS" | "CANCELLED";

export const ACTIVE_STATUSES: OrderStatus[] = [
  "NEW",
  "FUNDED",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "New",
  FUNDED: "Funded",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY_FOR_PICKUP: "Ready for Pickup",
  PICKED_UP: "Picked Up",
  CANCELLED: "Cancelled",
  RETURN_REQUESTED: "Return Requested",
  RETURN_CONFIRMED: "Return Confirmed",
  RETURN_REJECTED: "Return Rejected",
};
