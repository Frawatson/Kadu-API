/**
 * Auth routes — match the frontend's MSW contract:
 *   POST   /auth/partner/login            { credential, password }
 *   GET    /auth/partner/me               (Bearer access token)
 *   POST   /auth/partner/refresh          { refreshToken }
 *   POST   /auth/partner/password-change  { currentPassword, newPassword }
 *   POST   /auth/partner/forgot-password  { credential }
 *   POST   /auth/partner/reset-password   { token, newPassword }
 *   POST   /auth/partner/invite/accept    { token, password } → tokens + partner
 *   POST   /auth/partner/onboarding       { firstName, lastName, phone, role }
 */

import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail, ok } from "../lib/envelope.js";
import { toPartnerProfile } from "../lib/partner-mapper.js";
import { prisma } from "../lib/prisma.js";

const MIN_PASSWORD_LENGTH = 8;

const loginBody = z.object({
  credential: z.string().min(1),
  password: z.string().min(1),
});

const passwordChangeBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

const refreshBody = z.object({
  refreshToken: z.string().min(1),
});

interface PartnerJwtClaims {
  sub: string;
  type: "access" | "refresh";
}

export async function authRoutes(app: FastifyInstance) {
  // ── Login ─────────────────────────────────────────────────────────────
  app.post("/auth/partner/login", async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, {
        code: "VALIDATION_ERROR",
        message: "Email/phone and password are required",
        status: 400,
      });
    }

    const { credential, password } = parsed.data;
    const partner = await prisma.partner.findFirst({
      where: { OR: [{ email: credential }, { businessPhone: credential }] },
    });
    if (!partner) {
      return fail(reply, {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
        status: 401,
      });
    }
    const matches = await bcrypt.compare(password, partner.passwordHash);
    if (!matches) {
      return fail(reply, {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
        status: 401,
      });
    }

    const accessToken = await reply.jwtSign(
      { sub: partner.id, type: "access" } satisfies PartnerJwtClaims,
      { expiresIn: "15m" },
    );
    const refreshToken = await reply.jwtSign(
      { sub: partner.id, type: "refresh" } satisfies PartnerJwtClaims,
      { expiresIn: "7d" },
    );

    return ok(reply, {
      accessToken,
      refreshToken,
      partner: toPartnerProfile(partner),
    });
  });

  // ── /me — protected ──────────────────────────────────────────────────
  app.get("/auth/partner/me", { preHandler: requireAccess }, async (req, reply) => {
    const claims = req.user as PartnerJwtClaims;
    const partner = await prisma.partner.findUnique({ where: { id: claims.sub } });
    if (!partner) {
      return fail(reply, {
        code: "NOT_FOUND",
        message: "Partner not found",
        status: 404,
      });
    }
    return ok(reply, toPartnerProfile(partner));
  });

  // ── Refresh ─────────────────────────────────────────────────────────
  app.post("/auth/partner/refresh", async (req, reply) => {
    const parsed = refreshBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, {
        code: "INVALID_TOKEN",
        message: "refreshToken required",
        status: 400,
      });
    }
    let claims: PartnerJwtClaims;
    try {
      claims = app.jwt.verify<PartnerJwtClaims>(parsed.data.refreshToken);
    } catch {
      return fail(reply, {
        code: "INVALID_TOKEN",
        message: "Invalid or expired refresh token",
        status: 401,
      });
    }
    if (claims.type !== "refresh") {
      return fail(reply, {
        code: "INVALID_TOKEN",
        message: "Wrong token type",
        status: 401,
      });
    }
    const accessToken = await reply.jwtSign(
      { sub: claims.sub, type: "access" } satisfies PartnerJwtClaims,
      { expiresIn: "15m" },
    );
    const refreshToken = await reply.jwtSign(
      { sub: claims.sub, type: "refresh" } satisfies PartnerJwtClaims,
      { expiresIn: "7d" },
    );
    return ok(reply, { accessToken, refreshToken });
  });

  // ── Password change — protected ─────────────────────────────────────
  app.post(
    "/auth/partner/password-change",
    { preHandler: requireAccess },
    async (req, reply) => {
      const parsed = passwordChangeBody.safeParse(req.body);
      if (!parsed.success) {
        return fail(reply, {
          code: "VALIDATION_ERROR",
          message: "Current and new password are required",
          status: 400,
        });
      }
      const { currentPassword, newPassword } = parsed.data;
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return fail(reply, {
          code: "WEAK_PASSWORD",
          message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
          status: 400,
        });
      }
      if (newPassword === currentPassword) {
        return fail(reply, {
          code: "SAME_PASSWORD",
          message: "New password must differ from the current one",
          status: 400,
        });
      }
      const claims = req.user as PartnerJwtClaims;
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
      const matches = await bcrypt.compare(currentPassword, partner.passwordHash);
      if (!matches) {
        return fail(reply, {
          code: "INVALID_CURRENT_PASSWORD",
          message: "Current password is incorrect",
          status: 401,
        });
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.partner.update({
        where: { id: partner.id },
        data: { passwordHash },
      });
      return ok(reply, { ok: true });
    },
  );

  // ── Forgot password — stubbed (always 200) ──────────────────────────
  // Real backend would email the user; v1 just acks so the UI flow
  // is testable end-to-end.
  app.post("/auth/partner/forgot-password", async (_req, reply) => {
    return ok(reply, { sent: true });
  });

  // ── Reset password — stubbed validator ──────────────────────────────
  // Real backend would consume a one-time token from the email link.
  // For smoke we just check the new password's length floor.
  app.post("/auth/partner/reset-password", async (req, reply) => {
    const body = (req.body ?? {}) as {
      token?: string;
      newPassword?: string;
    };
    if (!body.token || body.token.trim().length === 0) {
      return fail(reply, {
        code: "INVALID_TOKEN",
        message: "Reset token is required",
        status: 400,
      });
    }
    if (!body.newPassword || body.newPassword.length < MIN_PASSWORD_LENGTH) {
      return fail(reply, {
        code: "WEAK_PASSWORD",
        message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        status: 400,
      });
    }
    return ok(reply, { ok: true });
  });

  // ── Accept invite — sets a password on the seeded "pending" partner
  // and returns tokens + the partner profile so the client can hydrate
  // the session in one round-trip. Subsequent calls upsert on the
  // pending email so the flow is idempotent.
  app.post("/auth/partner/invite/accept", async (req, reply) => {
    const body = (req.body ?? {}) as { token?: string; password?: string };
    if (!body.token || body.token.trim().length === 0) {
      return fail(reply, {
        code: "INVALID_TOKEN",
        message: "Invite token is required",
        status: 400,
      });
    }
    if (!body.password || body.password.length < MIN_PASSWORD_LENGTH) {
      return fail(reply, {
        code: "WEAK_PASSWORD",
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        status: 400,
      });
    }
    // Find or create the pending partner. Email is hardcoded for the
    // smoke-test seed so re-running the flow always lands on the same
    // row (matches MSW behavior).
    const passwordHash = await bcrypt.hash(body.password, 10);
    const partner = await prisma.partner.upsert({
      where: { email: "new@partner.lr" },
      update: { passwordHash },
      create: {
        businessName: "",
        businessPhone: "+231770007777",
        businessType: "OTHER",
        email: "new@partner.lr",
        ownerName: "",
        role: "OWNER",
        status: "PENDING_REVIEW",
        shopEnabled: false,
        passwordHash,
        setupProgress: {
          profileComplete: false,
          photosUploaded: false,
          catalogHasItems: false,
          payoutMethodSet: false,
          percentComplete: 0,
        },
      },
    });

    const accessToken = await reply.jwtSign(
      { sub: partner.id, type: "access" } satisfies PartnerJwtClaims,
      { expiresIn: "15m" },
    );
    const refreshToken = await reply.jwtSign(
      { sub: partner.id, type: "refresh" } satisfies PartnerJwtClaims,
      { expiresIn: "7d" },
    );
    return ok(reply, {
      accessToken,
      refreshToken,
      partner: toPartnerProfile(partner),
    });
  });

  // ── Onboarding — completes the first-run profile for a partner whose
  // setupProgress.profileComplete is still false. Patches ownerName +
  // businessPhone + role and flips profileComplete: true.
  app.post(
    "/auth/partner/onboarding",
    { preHandler: requireAccess },
    async (req, reply) => {
      const body = (req.body ?? {}) as {
        firstName?: string;
        lastName?: string;
        phone?: string;
        role?: string;
      };
      const firstName = body.firstName?.trim() ?? "";
      const lastName = body.lastName?.trim() ?? "";
      const phone = body.phone?.trim() ?? "";
      const role = body.role?.trim() ?? "";
      if (!firstName || !lastName || !phone || !role) {
        return fail(reply, {
          code: "VALIDATION_ERROR",
          message: "All fields are required",
          status: 400,
        });
      }
      if (role !== "OWNER" && role !== "MANAGER") {
        return fail(reply, {
          code: "INVALID_ROLE",
          message: "Role must be OWNER or MANAGER",
          status: 400,
        });
      }
      const claims = req.user as PartnerJwtClaims;
      const existing = await prisma.partner.findUnique({
        where: { id: claims.sub },
      });
      if (!existing) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Partner not found",
          status: 404,
        });
      }
      const prevProgress =
        (existing.setupProgress as Record<string, unknown>) ?? {};
      const updated = await prisma.partner.update({
        where: { id: claims.sub },
        data: {
          ownerName: `${firstName} ${lastName}`,
          businessPhone: `+231${phone.replace(/^\+?231/, "")}`,
          role: role as "OWNER" | "MANAGER",
          setupProgress: {
            ...prevProgress,
            profileComplete: true,
            percentComplete: 25,
          },
        },
      });
      return ok(reply, { partner: toPartnerProfile(updated) });
    },
  );
}

/**
 * Verify the access-token Bearer header and stash claims on `req.user`.
 * Local helper — Fastify will run it via `preHandler` on protected
 * routes. Refresh-token routes intentionally don't use this.
 */
async function requireAccess(req: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return fail(reply, {
      code: "UNAUTHORIZED",
      message: "Missing or invalid access token",
      status: 401,
    });
  }
  const claims = req.user as PartnerJwtClaims;
  if (claims.type !== "access") {
    return fail(reply, {
      code: "UNAUTHORIZED",
      message: "Wrong token type",
      status: 401,
    });
  }
}
