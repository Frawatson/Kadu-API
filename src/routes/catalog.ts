/**
 * Catalog — list (paginated, filtered), create, update, delete items.
 * Phase 6 consumer.
 *
 * Items are scoped per partner via `catalogForPartner` so a new
 * partner's POST/PATCH/DELETE doesn't leak into the seeded demo
 * partner's fixtures (or vice versa).
 */

import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { fail, noContent, ok } from "../lib/envelope.js";
import {
  catalogForPartner,
  trySubjectId,
} from "../lib/partner-context.js";
import { prisma } from "../lib/prisma.js";
import { mockCategories } from "../state/fixtures.js";
import type {
  CatalogItem,
  CreateItemPayload,
  StockStatus,
  UpdateItemPayload,
} from "../types/catalog.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function deriveStockStatus(qty: number): StockStatus {
  if (qty <= 0) return "OUT_OF_STOCK";
  if (qty <= 5) return "LOW_STOCK";
  return "IN_STOCK";
}

function isStockStatus(value: string): value is StockStatus {
  return (
    value === "IN_STOCK" || value === "LOW_STOCK" || value === "OUT_OF_STOCK"
  );
}

function clampPositiveInt(raw: string | undefined, fallback: number, max: number) {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.floor(parsed));
}

interface IdParams {
  id: string;
}

/**
 * Resolve the catalog array for the requesting partner. Returns null on
 * an anonymous request so write routes can issue a 401.
 */
async function resolveCatalog(
  req: FastifyRequest,
): Promise<CatalogItem[] | null> {
  const sub = await trySubjectId(req);
  if (sub === null) return null;
  const partner = await prisma.partner.findUnique({ where: { id: sub } });
  if (!partner) return null;
  return catalogForPartner(partner);
}

function fail401(reply: FastifyReply) {
  return fail(reply, {
    code: "UNAUTHORIZED",
    message: "Sign in to manage your catalog",
    status: 401,
  });
}

export async function catalogRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      empty?: string;
      q?: string;
      categoryId?: string;
      stockStatus?: string;
      page?: string;
      pageSize?: string;
    };
  }>("/catalog", async (req, reply) => {
    const arr = (await resolveCatalog(req)) ?? [];
    const force_empty = req.query.empty === "1";
    const q = req.query.q?.trim().toLowerCase() ?? "";
    const categoryId = req.query.categoryId ?? "";
    const stockStatusParam = req.query.stockStatus;
    const page = clampPositiveInt(req.query.page, 1, 100_000);
    const pageSize = clampPositiveInt(
      req.query.pageSize,
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

    if (stockStatusParam && !isStockStatus(stockStatusParam)) {
      return fail(reply, {
        code: "INVALID_FILTER",
        message: `Unknown stockStatus: ${stockStatusParam}`,
        status: 400,
      });
    }

    const source = force_empty ? [] : arr;
    const filtered = source.filter((item) => {
      if (categoryId && item.categoryId !== categoryId) return false;
      if (stockStatusParam && item.stockStatus !== stockStatusParam) return false;
      if (q.length > 0) {
        const haystack = `${item.name} ${item.sku ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const startIdx = (page - 1) * pageSize;
    const paged = filtered.slice(startIdx, startIdx + pageSize);

    return ok(reply, {
      items: paged,
      categories: mockCategories,
      total: filtered.length,
      page,
      pageSize,
    });
  });

  app.post("/catalog", async (req, reply) => {
    const arr = await resolveCatalog(req);
    if (arr === null) return fail401(reply);
    const body = (req.body ?? {}) as CreateItemPayload & { photos?: string[] };
    const category = mockCategories.find((c) => c.id === body.categoryId);
    if (!category) {
      return fail(reply, {
        code: "INVALID_CATEGORY",
        message: `Unknown categoryId: ${body.categoryId}`,
        status: 400,
      });
    }
    const now = new Date().toISOString();
    const created: CatalogItem = {
      id: `item-${Date.now()}`,
      name: body.name,
      description: body.description,
      categoryId: category.id,
      categoryName: category.name,
      price: body.price,
      stockQuantity: body.stockQuantity,
      stockStatus: deriveStockStatus(body.stockQuantity),
      photos: body.photos ?? [],
      sku: body.sku,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    arr.unshift(created);
    return ok(reply, created, 201);
  });

  app.patch<{ Params: IdParams }>("/catalog/:id", async (req, reply) => {
    const arr = await resolveCatalog(req);
    if (arr === null) return fail401(reply);
    const idx = arr.findIndex((i) => i.id === req.params.id);
    if (idx < 0) {
      return fail(reply, {
        code: "NOT_FOUND",
        message: `Item ${req.params.id} not found`,
        status: 404,
      });
    }
    const patch = (req.body ?? {}) as UpdateItemPayload & { photos?: string[] };
    const existing = arr[idx];
    let categoryName = existing.categoryName;
    if (patch.categoryId && patch.categoryId !== existing.categoryId) {
      const next = mockCategories.find((c) => c.id === patch.categoryId);
      if (!next) {
        return fail(reply, {
          code: "INVALID_CATEGORY",
          message: `Unknown categoryId: ${patch.categoryId}`,
          status: 400,
        });
      }
      categoryName = next.name;
    }
    const merged: CatalogItem = {
      ...existing,
      ...patch,
      categoryName,
      stockStatus:
        patch.stockQuantity !== undefined
          ? deriveStockStatus(patch.stockQuantity)
          : existing.stockStatus,
      updatedAt: new Date().toISOString(),
    };
    arr[idx] = merged;
    return ok(reply, merged);
  });

  app.delete<{ Params: IdParams }>("/catalog/:id", async (req, reply) => {
    const arr = await resolveCatalog(req);
    if (arr === null) return fail401(reply);
    const idx = arr.findIndex((i) => i.id === req.params.id);
    if (idx < 0) {
      return fail(reply, {
        code: "NOT_FOUND",
        message: "Item not found",
        status: 404,
      });
    }
    arr.splice(idx, 1);
    return noContent(reply);
  });
}
