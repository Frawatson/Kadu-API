/**
 * Catalog — items + shop categories (ENG-109: Partner Portal catalog management).
 *
 *   GET    /catalog                       list (paginated; ?q ?categoryId ?stockStatus ?status)
 *   POST   /catalog                       create item
 *   PATCH  /catalog/:id                   edit item / set status (availability, archive, restore)
 *   DELETE /catalog/:id                   hard-delete item
 *   GET    /catalog/categories            list categories with live item counts
 *   POST   /catalog/categories            create category
 *   PATCH  /catalog/categories/:id        rename / reorder (rename cascades to items)
 *   DELETE /catalog/categories/:id        delete (409 while any item still references it)
 *
 * Items and categories are scoped per partner via `catalogForPartner` /
 * `categoriesForPartner` so a new partner's writes never leak into the
 * seeded demo partner's fixtures (or vice versa).
 *
 * Item status semantics: ACTIVE (listed) · DISABLED (availability toggled
 * off) · ARCHIVED (soft-deleted, hidden unless `?status=ARCHIVED|ALL`).
 */

import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { z } from "zod";
import { fail, noContent, ok } from "../lib/envelope.js";
import {
  catalogForPartner,
  categoriesForPartner,
  trySubjectId,
} from "../lib/partner-context.js";
import { prisma } from "../lib/prisma.js";
import {
  ITEM_STATUSES,
  isItemStatus,
  type CatalogCategory,
  type CatalogItem,
  type ItemStatus,
  type StockStatus,
} from "../types/catalog.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_PHOTOS = 5;

// ─── Validation ─────────────────────────────────────────────────────────────

const itemStatusSchema = z.enum(ITEM_STATUSES as [ItemStatus, ...ItemStatus[]]);

const itemFields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  categoryId: z.string().trim().min(1),
  price: z.number().int().min(0),
  stockQuantity: z.number().int().min(0),
  sku: z.string().trim().max(40),
  photos: z.array(z.string().min(1)).max(MAX_PHOTOS),
};

const createItemBody = z.object({
  name: itemFields.name,
  description: itemFields.description.optional(),
  categoryId: itemFields.categoryId,
  price: itemFields.price,
  stockQuantity: itemFields.stockQuantity,
  sku: itemFields.sku.optional(),
  photos: itemFields.photos.optional(),
});

const updateItemBody = z
  .object({
    name: itemFields.name.optional(),
    description: itemFields.description.optional(),
    categoryId: itemFields.categoryId.optional(),
    price: itemFields.price.optional(),
    stockQuantity: itemFields.stockQuantity.optional(),
    sku: itemFields.sku.optional(),
    photos: itemFields.photos.optional(),
    status: itemStatusSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required",
  });

const categoryName = z.string().trim().min(1).max(60);

const createCategoryBody = z.object({ name: categoryName });

const updateCategoryBody = z
  .object({
    name: categoryName.optional(),
    displayOrder: z.number().int().min(0).optional(),
  })
  .refine((body) => body.name !== undefined || body.displayOrder !== undefined, {
    message: "Provide a name or displayOrder",
  });

// ─── Helpers ────────────────────────────────────────────────────────────────

function deriveStockStatus(qty: number): StockStatus {
  if (qty <= 0) return "OUT_OF_STOCK";
  if (qty <= 5) return "LOW_STOCK";
  return "IN_STOCK";
}

/**
 * Availability follows stock: a product with no stock can't be offered,
 * so it is flipped to DISABLED automatically, and an explicit attempt to
 * make it ACTIVE at zero stock is rejected. Restocking does NOT auto-enable
 * — the partner re-enables via the availability switch.
 */
function isOutOfStock(qty: number): boolean {
  return qty <= 0;
}

function failOutOfStock(reply: FastifyReply) {
  return fail(reply, {
    code: "OUT_OF_STOCK",
    message: "Add stock before making this product available",
    status: 409,
  });
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

let categoryCounter = 0;
function nextCategoryId(): string {
  categoryCounter += 1;
  return `cat-${Date.now()}-${categoryCounter}`;
}

/**
 * Categories with `itemCount` recomputed from the partner's items so the
 * number is always truthful (fixtures carry stale static counts).
 * Archived items don't count — they're out of the working catalog.
 */
function withLiveCounts(
  categories: readonly CatalogCategory[],
  items: readonly CatalogItem[],
): CatalogCategory[] {
  return [...categories]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((c) => ({
      ...c,
      itemCount: items.filter(
        (i) => i.categoryId === c.id && i.status !== "ARCHIVED",
      ).length,
    }));
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

interface PartnerCatalog {
  items: CatalogItem[];
  categories: CatalogCategory[];
}

/**
 * Resolve the catalog (items + categories) for the requesting partner.
 * Returns null on an anonymous request so write routes can issue a 401.
 */
async function resolveCatalog(req: FastifyRequest): Promise<PartnerCatalog | null> {
  const sub = await trySubjectId(req);
  if (sub === null) return null;
  const partner = await prisma.partner.findUnique({ where: { id: sub } });
  if (!partner) return null;
  return {
    items: catalogForPartner(partner),
    categories: categoriesForPartner(partner),
  };
}

function fail401(reply: FastifyReply) {
  return fail(reply, {
    code: "UNAUTHORIZED",
    message: "Sign in to manage your catalog",
    status: 401,
  });
}

function failValidation(reply: FastifyReply, error: z.ZodError) {
  const first = error.issues[0];
  const field = first?.path.join(".") || "body";
  return fail(reply, {
    code: "VALIDATION_ERROR",
    message: `${field}: ${first?.message ?? "Invalid request"}`,
    status: 400,
  });
}

function failNotFound(reply: FastifyReply, what: string, id: string) {
  return fail(reply, {
    code: "NOT_FOUND",
    message: `${what} ${id} not found`,
    status: 404,
  });
}

function failInvalidCategory(reply: FastifyReply, categoryId: string) {
  return fail(reply, {
    code: "INVALID_CATEGORY",
    message: `Unknown categoryId: ${categoryId}`,
    status: 400,
  });
}

interface IdParams {
  id: string;
}

interface ListQuery {
  empty?: string;
  q?: string;
  categoryId?: string;
  stockStatus?: string;
  status?: string;
  page?: string;
  pageSize?: string;
}

/** Default view hides archived items; `ALL` shows everything. */
function matchesStatusFilter(item: CatalogItem, status: string | undefined): boolean {
  if (!status) return item.status !== "ARCHIVED";
  if (status === "ALL") return true;
  return item.status === status;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function catalogRoutes(app: FastifyInstance) {
  // ── Items ──────────────────────────────────────────────────────────────

  app.get<{ Querystring: ListQuery }>("/catalog", async (req, reply) => {
    const ctx = await resolveCatalog(req);
    const items = ctx?.items ?? [];
    const categories = ctx?.categories ?? [];
    const forceEmpty = req.query.empty === "1";
    const q = req.query.q?.trim().toLowerCase() ?? "";
    const categoryId = req.query.categoryId ?? "";
    const stockStatusParam = req.query.stockStatus;
    const statusParam = req.query.status;
    const page = clampPositiveInt(req.query.page, 1, 100_000);
    const pageSize = clampPositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    if (stockStatusParam && !isStockStatus(stockStatusParam)) {
      return fail(reply, {
        code: "INVALID_FILTER",
        message: `Unknown stockStatus: ${stockStatusParam}`,
        status: 400,
      });
    }
    if (statusParam && statusParam !== "ALL" && !isItemStatus(statusParam)) {
      return fail(reply, {
        code: "INVALID_FILTER",
        message: `Unknown status: ${statusParam}`,
        status: 400,
      });
    }

    const source = forceEmpty ? [] : items;
    const filtered = source.filter((item) => {
      if (!matchesStatusFilter(item, statusParam)) return false;
      if (categoryId && item.categoryId !== categoryId) return false;
      if (stockStatusParam && item.stockStatus !== stockStatusParam) return false;
      if (q.length > 0) {
        const haystack = `${item.name} ${item.sku ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const startIdx = (page - 1) * pageSize;
    return ok(reply, {
      items: filtered.slice(startIdx, startIdx + pageSize),
      categories: withLiveCounts(categories, items),
      total: filtered.length,
      page,
      pageSize,
    });
  });

  app.post("/catalog", async (req, reply) => {
    const ctx = await resolveCatalog(req);
    if (ctx === null) return fail401(reply);
    const parsed = createItemBody.safeParse(req.body ?? {});
    if (!parsed.success) return failValidation(reply, parsed.error);
    const body = parsed.data;
    const category = ctx.categories.find((c) => c.id === body.categoryId);
    if (!category) return failInvalidCategory(reply, body.categoryId);

    const now = new Date().toISOString();
    const created: CatalogItem = {
      id: `item-${Date.now()}`,
      name: body.name,
      description: body.description || undefined,
      categoryId: category.id,
      categoryName: category.name,
      price: body.price,
      stockQuantity: body.stockQuantity,
      stockStatus: deriveStockStatus(body.stockQuantity),
      photos: body.photos ?? [],
      sku: body.sku || undefined,
      status: isOutOfStock(body.stockQuantity) ? "DISABLED" : "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    ctx.items.unshift(created);
    return ok(reply, created, 201);
  });

  app.patch<{ Params: IdParams }>("/catalog/:id", async (req, reply) => {
    const ctx = await resolveCatalog(req);
    if (ctx === null) return fail401(reply);
    const idx = ctx.items.findIndex((i) => i.id === req.params.id);
    if (idx < 0) return failNotFound(reply, "Item", req.params.id);
    const parsed = updateItemBody.safeParse(req.body ?? {});
    if (!parsed.success) return failValidation(reply, parsed.error);
    const patch = parsed.data;
    const existing = ctx.items[idx];

    let categoryName = existing.categoryName;
    if (patch.categoryId && patch.categoryId !== existing.categoryId) {
      const next = ctx.categories.find((c) => c.id === patch.categoryId);
      if (!next) return failInvalidCategory(reply, patch.categoryId);
      categoryName = next.name;
    }

    const merged: CatalogItem = {
      ...existing,
      ...patch,
      description:
        patch.description === undefined
          ? existing.description
          : patch.description || undefined,
      categoryName,
      stockStatus:
        patch.stockQuantity !== undefined
          ? deriveStockStatus(patch.stockQuantity)
          : existing.stockStatus,
      updatedAt: new Date().toISOString(),
    };
    if (merged.status === "ACTIVE" && isOutOfStock(merged.stockQuantity)) {
      // Explicitly switching on at zero stock is an error; any other write
      // that leaves the product out of stock just turns availability off.
      if (patch.status === "ACTIVE") return failOutOfStock(reply);
      merged.status = "DISABLED";
    }
    ctx.items[idx] = merged;
    return ok(reply, merged);
  });

  app.delete<{ Params: IdParams }>("/catalog/:id", async (req, reply) => {
    const ctx = await resolveCatalog(req);
    if (ctx === null) return fail401(reply);
    const idx = ctx.items.findIndex((i) => i.id === req.params.id);
    if (idx < 0) return failNotFound(reply, "Item", req.params.id);
    ctx.items.splice(idx, 1);
    return noContent(reply);
  });

  // ── Categories ─────────────────────────────────────────────────────────

  app.get("/catalog/categories", async (req, reply) => {
    const ctx = await resolveCatalog(req);
    if (ctx === null) return fail401(reply);
    return ok(reply, withLiveCounts(ctx.categories, ctx.items));
  });

  app.post("/catalog/categories", async (req, reply) => {
    const ctx = await resolveCatalog(req);
    if (ctx === null) return fail401(reply);
    const parsed = createCategoryBody.safeParse(req.body ?? {});
    if (!parsed.success) return failValidation(reply, parsed.error);
    const { name } = parsed.data;
    if (ctx.categories.some((c) => sameName(c.name, name))) {
      return fail(reply, {
        code: "CATEGORY_EXISTS",
        message: `A category named "${name}" already exists`,
        status: 409,
      });
    }
    const maxOrder = ctx.categories.reduce((m, c) => Math.max(m, c.displayOrder), 0);
    const created: CatalogCategory = {
      id: nextCategoryId(),
      name,
      itemCount: 0,
      displayOrder: maxOrder + 1,
    };
    ctx.categories.push(created);
    return ok(reply, created, 201);
  });

  app.patch<{ Params: IdParams }>("/catalog/categories/:id", async (req, reply) => {
    const ctx = await resolveCatalog(req);
    if (ctx === null) return fail401(reply);
    const category = ctx.categories.find((c) => c.id === req.params.id);
    if (!category) return failNotFound(reply, "Category", req.params.id);
    const parsed = updateCategoryBody.safeParse(req.body ?? {});
    if (!parsed.success) return failValidation(reply, parsed.error);
    const { name, displayOrder } = parsed.data;

    if (name !== undefined) {
      const clash = ctx.categories.some(
        (c) => c.id !== category.id && sameName(c.name, name),
      );
      if (clash) {
        return fail(reply, {
          code: "CATEGORY_EXISTS",
          message: `A category named "${name}" already exists`,
          status: 409,
        });
      }
      category.name = name;
      // Denormalised on items — keep them in step with the rename.
      for (const item of ctx.items) {
        if (item.categoryId === category.id) item.categoryName = name;
      }
    }
    if (displayOrder !== undefined) category.displayOrder = displayOrder;

    const [live] = withLiveCounts([category], ctx.items);
    return ok(reply, live);
  });

  app.delete<{ Params: IdParams }>("/catalog/categories/:id", async (req, reply) => {
    const ctx = await resolveCatalog(req);
    if (ctx === null) return fail401(reply);
    const idx = ctx.categories.findIndex((c) => c.id === req.params.id);
    if (idx < 0) return failNotFound(reply, "Category", req.params.id);
    // Archived items still reference the category — block until they're
    // reassigned or deleted so no item is left pointing at a ghost.
    const inUse = ctx.items.filter((i) => i.categoryId === req.params.id).length;
    if (inUse > 0) {
      return fail(reply, {
        code: "CATEGORY_IN_USE",
        message: `Move or delete the ${inUse} item${inUse === 1 ? "" : "s"} in this category first`,
        status: 409,
      });
    }
    ctx.categories.splice(idx, 1);
    return noContent(reply);
  });
}
