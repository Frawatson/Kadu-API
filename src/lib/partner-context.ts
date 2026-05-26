/**
 * Partner-context helpers — used by data endpoints to decide whether
 * a request belongs to the seeded demo partner (rich fixtures) or
 * to a freshly-onboarded partner (clean slate).
 *
 * The smoke-test backend doesn't model multi-partner data scoping
 * yet — every page's mocks (orders, catalog, wallet, reviews, team
 * fixtures) are global. To keep new partners from seeing the demo
 * partner's history, data routes call `isSeededRequest()` and fall
 * back to an empty payload when the answer is `false`.
 */

import type { FastifyRequest } from "fastify";
import type { Partner } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  mockItems,
  mockLocations,
  mockPayoutMethods,
  partnerCatalog,
  partnerLocations,
  partnerPayoutMethods,
} from "../state/fixtures.js";
import type { CatalogItem } from "../types/catalog.js";
import type { ShopLocation } from "../types/partner.js";
import type { PayoutMethod } from "../types/wallet.js";

/** Email of the canonical demo partner seeded in `prisma/seed.ts`. */
export const SEEDED_PARTNER_EMAIL = "info@monroviahardware.lr";

/**
 * Synthetic email addresses we attach to the partner row at invite-accept
 * time so the unique-key constraint is satisfied — these are not real
 * emails the user picked. The mapper hides them in API responses (so
 * Settings shows an empty field) and PATCH /partner/profile rejects
 * attempts to *set* them, so we never end up with a row whose email is
 * a placeholder by user action.
 */
const PLACEHOLDER_EMAILS = new Set(["new@partner.lr"]);

export function isPlaceholderEmail(email: string): boolean {
  return PLACEHOLDER_EMAILS.has(email.trim().toLowerCase());
}

interface JwtClaims {
  sub: string;
  type: "access" | "refresh";
}

/**
 * Try to verify the Bearer token without erroring. Returns the JWT
 * subject (partner id) on success, or `null` for missing/invalid
 * tokens. Data endpoints use this to identify the requester without
 * requiring a strict auth middleware.
 */
export async function trySubjectId(req: FastifyRequest): Promise<string | null> {
  try {
    await req.jwtVerify();
  } catch {
    return null;
  }
  const claims = req.user as JwtClaims | undefined;
  if (!claims || claims.type !== "access" || !claims.sub) return null;
  return claims.sub;
}

/**
 * `true` when the authenticated partner is the seeded demo partner.
 * Unauthenticated requests count as seeded too — keeps the smoke-test
 * UX intact when the frontend is browsed without a session (dev MSW
 * fallback). New partners with their own JWT get the empty path.
 */
export async function isSeededRequest(req: FastifyRequest): Promise<boolean> {
  const sub = await trySubjectId(req);
  if (sub === null) return true;
  const partner = await prisma.partner.findUnique({ where: { id: sub } });
  return partner?.email === SEEDED_PARTNER_EMAIL;
}

export function isSeededPartner(p: Partner | null | undefined): boolean {
  return !!p && p.email === SEEDED_PARTNER_EMAIL;
}

/**
 * Build a first-storefront object from the partner row's onboarding
 * fields. Used when the partner has business details on file but no
 * stores exist yet — typically right after the "Tell us about your
 * business" PATCH, or after an API restart wipes the in-memory map.
 *
 * The store id is derived from the partner id (not Date.now()) so it
 * stays stable across `tsx watch` reloads — otherwise the frontend's
 * cached `location.store` id would 404 against the freshly-seeded
 * record after every restart.
 */
function buildFirstStoreFromPartner(row: Partner): ShopLocation {
  return {
    id: `loc-${row.id}`,
    name: row.businessName,
    category: row.businessType,
    address: {
      line1: row.businessAddress ?? "",
      city: "",
      country: "Liberia",
    },
    phone: row.businessPhone,
    contactPerson: row.ownerName,
    contactPhone: row.businessPhone,
    hours: [],
    photos: [],
    shopEnabled: false,
    status: "SETUP_INCOMPLETE",
    itemCount: 0,
  };
}

/**
 * Locations array for a partner. Seeded demo partner shares the
 * canonical `mockLocations`; everyone else gets a per-partner array
 * lazily allocated in `partnerLocations`. Returned by reference so
 * mutations (push, splice, in-place patch) persist for the lifetime
 * of the API process.
 *
 * If the partner has finished the business onboarding step
 * (`businessName` + `businessAddress` both set) but has zero locations
 * — e.g. right after onboarding, or after a `tsx watch` restart wiped
 * the in-memory map — we seed a first storefront from the row data.
 * This keeps the Shop Profile page from sticking on its empty state
 * across process restarts.
 */
export function locationsForPartner(row: Partner): ShopLocation[] {
  if (row.email === SEEDED_PARTNER_EMAIL) return mockLocations;
  let arr = partnerLocations.get(row.id);
  if (!arr) {
    arr = [];
    partnerLocations.set(row.id, arr);
  }
  if (arr.length === 0 && row.businessName && row.businessAddress) {
    arr.push(buildFirstStoreFromPartner(row));
  }
  return arr;
}

/**
 * Catalog items for a partner. Seeded demo partner shares the canonical
 * `mockItems`; everyone else gets a per-partner array. Same reference-
 * sharing semantics as `locationsForPartner` so mutations persist.
 */
export function catalogForPartner(row: Partner): CatalogItem[] {
  if (row.email === SEEDED_PARTNER_EMAIL) return mockItems;
  let arr = partnerCatalog.get(row.id);
  if (!arr) {
    arr = [];
    partnerCatalog.set(row.id, arr);
  }
  return arr;
}

/**
 * Payout methods for a partner. Seeded demo partner shares the canonical
 * `mockPayoutMethods`; everyone else gets a per-partner array.
 */
export function payoutMethodsForPartner(row: Partner): PayoutMethod[] {
  if (row.email === SEEDED_PARTNER_EMAIL) return mockPayoutMethods;
  let arr = partnerPayoutMethods.get(row.id);
  if (!arr) {
    arr = [];
    partnerPayoutMethods.set(row.id, arr);
  }
  return arr;
}
