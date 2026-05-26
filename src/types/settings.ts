/**
 * Settings types — shared by the Settings General / Team / Notifications
 * tabs (Phase 9).
 */

export type Language = "en";
export type CurrencyCode = "USD" | "LRD";

export interface SettingsGeneral {
  /** Partner-facing display name (2–80 chars). */
  displayName: string;
  language: Language;
  /** IANA timezone string. UI exposes a hardcoded short list for v1. */
  timezone: string;
  defaultCurrency: CurrencyCode;
}

export type TeamRole = "OWNER" | "MANAGER" | "ACCOUNTANT";
export type TeamMemberStatus = "ACTIVE" | "PENDING";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: TeamMemberStatus;
  /** ISO timestamp; omitted for PENDING rows. */
  lastActiveAt?: string;
}

export interface Invitation {
  token: string;
  memberId: string;
  /** Relative URL the invitee should open, e.g. `/invite/<token>`. */
  url: string;
  expiresAt: string;
  createdAt: string;
}

/** Returned by `POST /api/v1/settings/team/invitations`. */
export interface InviteResponse {
  member: TeamMember;
  invitation: Invitation;
}

export type EmailNotificationKey = "orderUpdates" | "payoutAlerts" | "reviews";
export type SmsNotificationKey = "pickupReminders" | "returnRequests";

export interface NotificationPrefs {
  email: Record<EmailNotificationKey, boolean>;
  sms: Record<SmsNotificationKey, boolean>;
}
