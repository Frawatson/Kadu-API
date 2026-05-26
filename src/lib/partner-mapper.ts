/**
 * Adapt the Prisma Partner row to the shape the frontend's
 * `PartnerProfile` type expects.
 *
 * Locations live in `state/fixtures.ts` (in-memory) for the smoke-
 * test backend — the partner row in Postgres deliberately doesn't
 * model multi-location yet. To prevent newly-onboarded partners
 * from seeing the seeded demo partner's stores, we only attach the
 * fixtures when the row is the seeded partner. New partners start
 * with an empty `locations` array (the topbar falls back to the
 * partner's `businessName`, the Shop Profile page shows the empty
 * state).
 */

import type { Partner } from "@prisma/client";
import {
  isPlaceholderEmail,
  locationsForPartner,
} from "./partner-context.js";

/**
 * Hide synthetic invite-accept placeholders from API consumers. The
 * Settings card uses the resulting empty string to surface the "add your
 * email" empty state; real emails pass through unchanged.
 */
function displayEmail(rowEmail: string): string {
  return isPlaceholderEmail(rowEmail) ? "" : rowEmail;
}

export interface PartnerProfileResponse {
  id: string;
  businessName: string;
  businessPhone: string;
  businessType: string;
  email: string;
  ownerName: string;
  role: string;
  status: string;
  shopEnabled: boolean;
  setupProgress: unknown;
  locations: unknown[];
  activeLocationId: string;
  createdAt: string;
}

export function toPartnerProfile(row: Partner): PartnerProfileResponse {
  const locations = locationsForPartner(row);
  const activeLocationId = locations[0]?.id ?? "";

  return {
    id: row.id,
    businessName: row.businessName,
    businessPhone: row.businessPhone,
    businessType: row.businessType,
    email: displayEmail(row.email),
    ownerName: row.ownerName,
    role: row.role,
    status: row.status === "ACTIVE" ? "APPROVED" : row.status,
    shopEnabled: row.shopEnabled,
    setupProgress: row.setupProgress,
    locations,
    activeLocationId,
    createdAt: row.createdAt.toISOString(),
  };
}
