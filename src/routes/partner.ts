/**
 * Partner profile — read + patch. Backed by Postgres so /me and
 * /partner/profile stay consistent.
 *
 * PATCH accepts a small whitelist (ownerName, businessPhone). Email
 * + role are not editable from the Settings UI; an account-email
 * change would need its own verification flow.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { fail, noContent, ok } from "../lib/envelope.js";
import {
  isPlaceholderEmail,
  SEEDED_PARTNER_EMAIL,
} from "../lib/partner-context.js";
import { toPartnerProfile } from "../lib/partner-mapper.js";
import { prisma } from "../lib/prisma.js";
import {
  partnerCatalog,
  partnerLocations,
  partnerPayoutMethods,
} from "../state/fixtures.js";

interface JwtClaims {
  sub: string;
  type: "access" | "refresh";
}

async function requireAccess(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return fail(reply, {
      code: "UNAUTHORIZED",
      message: "Missing or invalid access token",
      status: 401,
    });
  }
  const claims = req.user as JwtClaims;
  if (claims.type !== "access") {
    return fail(reply, {
      code: "UNAUTHORIZED",
      message: "Wrong token type",
      status: 401,
    });
  }
}

const VALID_BUSINESS_TYPES = [
  "HARDWARE_STORE",
  "PLUMBING_SUPPLY",
  "ELECTRICAL_SUPPLY",
  "PAINT_AND_FINISHES",
  "TOOLS_AND_EQUIPMENT",
  "OTHER",
] as const;

const profilePatch = z
  .object({
    ownerName: z.string().min(2).max(80).optional(),
    businessPhone: z.string().min(1).optional(),
    businessName: z.string().min(2).max(80).optional(),
    businessType: z.enum(VALID_BUSINESS_TYPES).optional(),
    businessAddress: z.string().min(2).max(200).optional(),
    email: z.string().email().max(120).optional(),
  })
  .strict();

export async function partnerRoutes(app: FastifyInstance) {
  app.get(
    "/partner/profile",
    { preHandler: requireAccess },
    async (req, reply) => {
      const claims = req.user as JwtClaims;
      const partner = await prisma.partner.findUnique({
        where: { id: claims.sub },
      });
      if (!partner) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Partner not found",
          status: 404,
        });
      }
      return ok(reply, toPartnerProfile(partner));
    },
  );

  app.patch(
    "/partner/profile",
    { preHandler: requireAccess },
    async (req, reply) => {
      const parsed = profilePatch.safeParse(req.body);
      if (!parsed.success) {
        return fail(reply, {
          code: "INVALID_BODY",
          message: parsed.error.issues[0]?.message ?? "Invalid body",
          status: 400,
        });
      }
      const patch = parsed.data;
      const claims = req.user as JwtClaims;

      // Email validation: block placeholder values (they exist solely to
      // satisfy the unique-key constraint at invite-accept time and are
      // hidden from clients), then reject collisions with another
      // partner. Prisma would throw a P2002 on collisions, but a plain
      // 409 is friendlier and lets the UI surface a clear message.
      if (patch.email !== undefined) {
        const normalized = patch.email.trim().toLowerCase();
        if (isPlaceholderEmail(normalized)) {
          return fail(reply, {
            code: "INVALID_EMAIL",
            message: "Please use your own email address.",
            status: 400,
          });
        }
        const collision = await prisma.partner.findUnique({
          where: { email: normalized },
        });
        if (collision && collision.id !== claims.sub) {
          return fail(reply, {
            code: "EMAIL_TAKEN",
            message: "That email is already in use",
            status: 409,
          });
        }
      }

      const updated = await prisma.partner.update({
        where: { id: claims.sub },
        data: {
          ...(patch.ownerName !== undefined
            ? { ownerName: patch.ownerName.trim() }
            : {}),
          ...(patch.businessPhone !== undefined
            ? { businessPhone: patch.businessPhone.trim() }
            : {}),
          ...(patch.businessName !== undefined
            ? { businessName: patch.businessName.trim() }
            : {}),
          ...(patch.businessType !== undefined
            ? { businessType: patch.businessType }
            : {}),
          ...(patch.businessAddress !== undefined
            ? { businessAddress: patch.businessAddress.trim() }
            : {}),
          ...(patch.email !== undefined
            ? { email: patch.email.trim().toLowerCase() }
            : {}),
        },
      });

      // toPartnerProfile -> locationsForPartner lazily seeds the first
      // storefront when the partner now has businessName + address but
      // no locations on file (covers both "first patch" and "in-memory
      // map was cleared by a restart" cases).
      return ok(reply, toPartnerProfile(updated));
    },
  );

  /**
   * Permanently close the partner's account.
   *
   * Hard delete: removes the Prisma row plus any per-partner in-memory
   * state (locations, catalog items, payout methods, settings). The
   * seeded demo partner is protected so the public smoke-test experience
   * stays intact across resets.
   *
   * The client must echo the partner's exact `businessName` in the
   * request body as a misclick guard — symmetric with the type-to-confirm
   * dialog on the UI side. Returns 204 on success.
   */
  app.delete(
    "/partner/account",
    { preHandler: requireAccess },
    async (req, reply) => {
      const claims = req.user as JwtClaims;
      const partner = await prisma.partner.findUnique({
        where: { id: claims.sub },
      });
      if (!partner) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Partner not found",
          status: 404,
        });
      }
      if (partner.email === SEEDED_PARTNER_EMAIL) {
        return fail(reply, {
          code: "DEMO_PARTNER_PROTECTED",
          message:
            "The seeded demo partner can't be deleted from the smoke-test backend.",
          status: 403,
        });
      }

      const body = (req.body ?? {}) as { confirmName?: string };
      const supplied = body.confirmName?.trim() ?? "";
      if (supplied !== partner.businessName.trim()) {
        return fail(reply, {
          code: "CONFIRMATION_MISMATCH",
          message: "Type your business name exactly to confirm deletion.",
          status: 400,
        });
      }

      // Prisma cascades the settings row via the schema's onDelete:
      // Cascade relation, so a single delete clears Postgres state.
      await prisma.partner.delete({ where: { id: claims.sub } });

      // Drop the per-partner in-memory state too — leaving these entries
      // would leak storage and re-attach to a future partner that ever
      // happened to land on the same cuid (cosmically unlikely but free
      // to clean up).
      partnerLocations.delete(claims.sub);
      partnerCatalog.delete(claims.sub);
      partnerPayoutMethods.delete(claims.sub);

      return noContent(reply);
    },
  );
}
