/**
 * Settings — General (Postgres-backed) + Team + Notifications
 * (in-memory, ported from MSW). Phase 9 consumer.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { fail, noContent, ok } from "../lib/envelope.js";
import {
  isSeededPartner,
  trySubjectId,
} from "../lib/partner-context.js";
import { prisma } from "../lib/prisma.js";
import { mockInvitations, mockTeam, mockNotificationPrefs } from "../state/fixtures.js";
import type {
  EmailNotificationKey,
  Invitation,
  InviteResponse,
  SmsNotificationKey,
  TeamMember,
  TeamRole,
} from "../types/settings.js";

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

const generalPatch = z
  .object({
    displayName: z.string().optional(),
    language: z.literal("en").optional(),
    timezone: z.string().optional(),
    defaultCurrency: z.enum(["USD", "LRD"]).optional(),
  })
  .strict();

function shape(row: {
  displayName: string;
  language: string;
  timezone: string;
  defaultCurrency: string;
}) {
  return {
    displayName: row.displayName,
    language: row.language,
    timezone: row.timezone,
    defaultCurrency: row.defaultCurrency,
  };
}

const INVITABLE_ROLES: readonly TeamRole[] = ["MANAGER", "ACCOUNTANT"];
const ALL_ROLES: readonly TeamRole[] = ["OWNER", "MANAGER", "ACCOUNTANT"];
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const EMAIL_NOTIFICATION_KEYS: readonly EmailNotificationKey[] = [
  "orderUpdates",
  "payoutAlerts",
  "reviews",
];
const SMS_NOTIFICATION_KEYS: readonly SmsNotificationKey[] = [
  "pickupReminders",
  "returnRequests",
];

function isInvitableRole(value: unknown): value is TeamRole {
  return (
    typeof value === "string" &&
    (INVITABLE_ROLES as readonly string[]).includes(value)
  );
}
function isTeamRole(value: unknown): value is TeamRole {
  return (
    typeof value === "string" &&
    (ALL_ROLES as readonly string[]).includes(value)
  );
}
function isEmailKey(k: string): boolean {
  return (EMAIL_NOTIFICATION_KEYS as readonly string[]).includes(k);
}
function isSmsKey(k: string): boolean {
  return (SMS_NOTIFICATION_KEYS as readonly string[]).includes(k);
}

function wouldLeaveNoOwner(
  team: readonly TeamMember[],
  changedId: string,
  newRole: TeamRole | null,
): boolean {
  const remainingOwners = team.filter(
    (m) =>
      m.status === "ACTIVE" &&
      m.role === "OWNER" &&
      (m.id !== changedId || newRole === "OWNER"),
  );
  return remainingOwners.length === 0;
}

interface IdParams {
  id: string;
}

export async function settingsRoutes(app: FastifyInstance) {
  // ─── General (Postgres-backed) ─────────────────────────────────────────
  app.get(
    "/settings/general",
    { preHandler: requireAccess },
    async (req, reply) => {
      const claims = req.user as JwtClaims;
      const settings = await prisma.settingsGeneral.findUnique({
        where: { partnerId: claims.sub },
      });
      if (!settings) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Settings not initialised for this partner",
          status: 404,
        });
      }
      return ok(reply, shape(settings));
    },
  );

  app.patch(
    "/settings/general",
    { preHandler: requireAccess },
    async (req, reply) => {
      const parsed = generalPatch.safeParse(req.body);
      if (!parsed.success) {
        return fail(reply, {
          code: "INVALID_BODY",
          message: parsed.error.issues[0]?.message ?? "Invalid body",
          status: 400,
        });
      }
      const patch = parsed.data;
      if (patch.displayName !== undefined) {
        const trimmed = patch.displayName.trim();
        if (trimmed.length < 2 || trimmed.length > 80) {
          return fail(reply, {
            code: "INVALID_DISPLAY_NAME",
            message: "Display name must be 2–80 characters",
            status: 400,
          });
        }
        patch.displayName = trimmed;
      }
      if (patch.timezone !== undefined) {
        const tz = patch.timezone.trim();
        if (tz.length === 0) {
          return fail(reply, {
            code: "INVALID_TIMEZONE",
            message: "Timezone is required",
            status: 400,
          });
        }
        patch.timezone = tz;
      }
      const claims = req.user as JwtClaims;
      const updated = await prisma.settingsGeneral.update({
        where: { partnerId: claims.sub },
        data: patch,
      });
      return ok(reply, shape(updated));
    },
  );

  // ─── Team (in-memory) ─────────────────────────────────────────────────
  // Seeded partner gets the demo team (Emmanuel Kollie + Princess
  // Hayes); newly-onboarded partners get a single-row team containing
  // just themselves as Owner.
  app.get("/settings/team", async (req, reply) => {
    const sub = await trySubjectId(req);
    if (sub === null) return ok(reply, mockTeam);
    const partner = await prisma.partner.findUnique({ where: { id: sub } });
    if (isSeededPartner(partner)) return ok(reply, mockTeam);
    if (!partner) return ok(reply, []);
    return ok(reply, [
      {
        id: `tm-${partner.id}`,
        name: partner.ownerName,
        email: partner.email,
        role: "OWNER" as const,
        status: "ACTIVE" as const,
        lastActiveAt: new Date().toISOString(),
      },
    ]);
  });

  app.post("/settings/team/invitations", async (req, reply) => {
    const body = (req.body ?? {}) as { email?: unknown; role?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (email.length === 0 || !email.includes("@")) {
      return fail(reply, {
        code: "INVALID_EMAIL",
        message: "A valid email address is required",
        status: 400,
      });
    }
    if (!isInvitableRole(body.role)) {
      return fail(reply, {
        code: "INVALID_ROLE",
        message: "Role must be MANAGER or ACCOUNTANT",
        status: 400,
      });
    }
    const lowercased = email.toLowerCase();
    if (mockTeam.some((m) => m.email.trim().toLowerCase() === lowercased)) {
      return fail(reply, {
        code: "EMAIL_TAKEN",
        message: "Someone with that email is already on your team",
        status: 409,
      });
    }
    const id = `tm-${Date.now()}`;
    const token = `inv-${crypto.randomUUID()}`;
    const now = new Date();
    const member: TeamMember = {
      id,
      name: "",
      email,
      role: body.role,
      status: "PENDING",
    };
    const invitation: Invitation = {
      token,
      memberId: id,
      url: `/invite/${token}`,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
      createdAt: now.toISOString(),
    };
    mockTeam.push(member);
    mockInvitations.push(invitation);
    const response: InviteResponse = { member, invitation };
    return ok(reply, response, 201);
  });

  app.patch<{ Params: IdParams }>(
    "/settings/team/:id",
    async (req, reply) => {
      const id = req.params.id;
      const idx = mockTeam.findIndex((m) => m.id === id);
      if (idx < 0) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Team member not found",
          status: 404,
        });
      }
      const body = (req.body ?? {}) as { role?: unknown };
      if (!isTeamRole(body.role)) {
        return fail(reply, {
          code: "INVALID_ROLE",
          message: `Unsupported role: ${String(body.role)}`,
          status: 400,
        });
      }
      if (wouldLeaveNoOwner(mockTeam, id, body.role)) {
        return fail(reply, {
          code: "LAST_OWNER",
          message: "At least one owner must remain on the team",
          status: 400,
        });
      }
      const updated: TeamMember = { ...mockTeam[idx], role: body.role };
      mockTeam[idx] = updated;
      return ok(reply, updated);
    },
  );

  app.delete<{ Params: IdParams }>(
    "/settings/team/:id",
    async (req, reply) => {
      const id = req.params.id;
      const idx = mockTeam.findIndex((m) => m.id === id);
      if (idx < 0) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Team member not found",
          status: 404,
        });
      }
      if (wouldLeaveNoOwner(mockTeam, id, null)) {
        return fail(reply, {
          code: "LAST_OWNER",
          message: "At least one owner must remain on the team",
          status: 400,
        });
      }
      mockTeam.splice(idx, 1);
      const inviteIdx = mockInvitations.findIndex((i) => i.memberId === id);
      if (inviteIdx >= 0) mockInvitations.splice(inviteIdx, 1);
      return noContent(reply);
    },
  );

  // ─── Notifications (in-memory) ────────────────────────────────────────
  app.get("/settings/notifications", async (_req, reply) =>
    ok(reply, mockNotificationPrefs),
  );

  app.patch("/settings/notifications", async (req, reply) => {
    const patch = (req.body ?? {}) as Partial<{
      email: Record<string, unknown>;
      sms: Record<string, unknown>;
    }>;

    const validateChannel = (
      channelName: "email" | "SMS",
      bag: Record<string, unknown> | undefined,
      isKey: (k: string) => boolean,
    ): ReturnType<typeof fail> | null => {
      if (bag === undefined) return null;
      for (const [k, v] of Object.entries(bag)) {
        if (!isKey(k)) {
          return fail(reply, {
            code: "INVALID_NOTIFICATION_KEY",
            message: `Unknown ${channelName} notification key: ${k}`,
            status: 400,
          });
        }
        if (typeof v !== "boolean") {
          return fail(reply, {
            code: "INVALID_NOTIFICATION_VALUE",
            message: `Notification values must be boolean (got ${typeof v} for ${k})`,
            status: 400,
          });
        }
      }
      return null;
    };

    const emailErr = validateChannel("email", patch.email, isEmailKey);
    if (emailErr) return emailErr;
    const smsErr = validateChannel("SMS", patch.sms, isSmsKey);
    if (smsErr) return smsErr;

    if (patch.email !== undefined) {
      Object.assign(mockNotificationPrefs.email, patch.email);
    }
    if (patch.sms !== undefined) {
      Object.assign(mockNotificationPrefs.sms, patch.sms);
    }
    return ok(reply, mockNotificationPrefs);
  });
}
