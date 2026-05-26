/**
 * Stores (≈ ShopLocation) — list, create, read, patch, sub-resources.
 *
 * Locations are stored per-partner in `partnerLocations` (see
 * `partner-context.ts`). The seeded demo partner shares the canonical
 * `mockLocations`; new partners get their own lazily-allocated array
 * so they can run the Add-Store wizard without polluting the demo.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fail, ok } from "../lib/envelope.js";
import {
  locationsForPartner,
  trySubjectId,
} from "../lib/partner-context.js";
import { prisma } from "../lib/prisma.js";
import type { Address, ShopLocation } from "../types/partner.js";

interface IdParams {
  id: string;
}

/**
 * Resolve the locations array for the requesting partner. Falls back
 * to an empty array for unauthenticated requests so the smoke-test
 * UX still loads cleanly when a token isn't present.
 */
async function resolveLocations(
  req: FastifyRequest,
): Promise<ShopLocation[] | null> {
  const sub = await trySubjectId(req);
  if (sub === null) return null;
  const partner = await prisma.partner.findUnique({ where: { id: sub } });
  if (!partner) return null;
  return locationsForPartner(partner);
}

export async function storesRoutes(app: FastifyInstance) {
  app.get("/stores", async (req, reply) => {
    const arr = await resolveLocations(req);
    return ok(reply, arr ?? []);
  });

  app.post("/stores", async (req, reply) => {
    const arr = await resolveLocations(req);
    if (arr === null) return fail401(reply);
    const body = (req.body ?? {}) as Partial<ShopLocation>;
    const created: ShopLocation = {
      id: `loc-${Date.now()}`,
      name: body.name ?? "Untitled Store",
      address: body.address ?? { line1: "", city: "", country: "Liberia" },
      hours: body.hours ?? [],
      photos: body.photos ?? [],
      status: "SETUP_INCOMPLETE",
      itemCount: 0,
    };
    arr.push(created);
    return ok(reply, created, 201);
  });

  app.get<{ Params: IdParams }>("/stores/:id", async (req, reply) => {
    const arr = (await resolveLocations(req)) ?? [];
    const store = arr.find((s) => s.id === req.params.id);
    if (!store) {
      return fail(reply, {
        code: "NOT_FOUND",
        message: `Store ${req.params.id} not found`,
        status: 404,
      });
    }
    return ok(reply, store);
  });

  app.patch<{ Params: IdParams }>("/stores/:id", async (req, reply) => {
    const arr = await resolveLocations(req);
    if (arr === null) return fail401(reply);
    const idx = arr.findIndex((s) => s.id === req.params.id);
    if (idx < 0) {
      return fail(reply, {
        code: "NOT_FOUND",
        message: `Store ${req.params.id} not found`,
        status: 404,
      });
    }
    const body = (req.body ?? {}) as Partial<ShopLocation>;
    const merged: ShopLocation = {
      ...arr[idx],
      ...body,
      address: (body.address ?? arr[idx].address) as Address,
    };
    arr[idx] = merged;
    return ok(reply, merged);
  });

  app.get<{ Params: IdParams }>(
    "/stores/:id/locations",
    async (req, reply) => {
      const arr = (await resolveLocations(req)) ?? [];
      const store = arr.find((s) => s.id === req.params.id);
      if (!store) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Store not found",
          status: 404,
        });
      }
      return ok(reply, [store.address]);
    },
  );

  app.get<{ Params: IdParams }>("/stores/:id/hours", async (req, reply) => {
    const arr = (await resolveLocations(req)) ?? [];
    const store = arr.find((s) => s.id === req.params.id);
    if (!store) {
      return fail(reply, {
        code: "NOT_FOUND",
        message: "Store not found",
        status: 404,
      });
    }
    return ok(reply, store.hours);
  });

  // Photo upload endpoints — echo a fake URL since we don't actually
  // store binaries in the smoke-test backend.
  app.post<{ Params: IdParams }>(
    "/stores/:id/photos",
    async (req, reply) => {
      const arr = (await resolveLocations(req)) ?? [];
      const store = arr.find((s) => s.id === req.params.id);
      if (!store) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Store not found",
          status: 404,
        });
      }
      return ok(
        reply,
        { url: `/mock/uploads/store-${req.params.id}-${Date.now()}.jpg` },
        201,
      );
    },
  );

  // Pre-create photo upload (no store id yet).
  app.post("/uploads/store-photo", async (_req, reply) =>
    ok(
      reply,
      { url: `/mock/uploads/draft-${Date.now()}-${crypto.randomUUID()}.jpg` },
      201,
    ),
  );
}

function fail401(reply: FastifyReply) {
  return fail(reply, {
    code: "UNAUTHORIZED",
    message: "Sign in to manage stores",
    status: 401,
  });
}
