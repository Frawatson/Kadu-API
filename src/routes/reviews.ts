/**
 * Reviews — list (paginated, filtered, sorted, with summary) + reply
 * lifecycle. Phase 8 consumer.
 *
 * Filters: all / positive (4–5★) / neutral (3★) / negative (1–2★) /
 * not-replied. Sorts: recent (default) / highest / lowest.
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { fail, noContent, ok } from "../lib/envelope.js";
import { isSeededRequest } from "../lib/partner-context.js";
import { mockReviews } from "../state/fixtures.js";
import {
  MAX_REPLY_LENGTH,
  type RatingDistribution,
  type Review,
  type ReviewFilter,
  type ReviewRating,
  type ReviewReply,
  type ReviewSort,
  type ReviewSummary,
} from "../types/review.js";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const VALID_FILTERS: readonly ReviewFilter[] = [
  "all",
  "positive",
  "neutral",
  "negative",
  "not-replied",
];
const VALID_SORTS: readonly ReviewSort[] = ["recent", "highest", "lowest"];

function clampPositiveInt(raw: string | undefined, fallback: number, max: number) {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function isReviewRating(n: number): n is ReviewRating {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

function isFilter(value: string): value is ReviewFilter {
  return (VALID_FILTERS as readonly string[]).includes(value);
}

function isSort(value: string): value is ReviewSort {
  return (VALID_SORTS as readonly string[]).includes(value);
}

function emptyDistribution(): RatingDistribution {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function computeReviewSummary(reviews: Review[]): ReviewSummary {
  const distribution = emptyDistribution();
  for (const r of reviews) distribution[r.rating]++;
  const total = reviews.length;
  if (total === 0) {
    return {
      average: 0,
      total: 0,
      distribution,
      positiveRate: 0,
      responseRate: 0,
      unrepliedCount: 0,
    };
  }
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  const positives = reviews.filter((r) => r.rating >= 4).length;
  const replied = reviews.filter((r) => r.reply !== undefined).length;
  return {
    average: Math.round((sum / total) * 10) / 10,
    total,
    distribution,
    positiveRate: Math.round((positives / total) * 100),
    responseRate: Math.round((replied / total) * 100),
    unrepliedCount: total - replied,
  };
}

function applyFilter(reviews: Review[], filter: ReviewFilter): Review[] {
  switch (filter) {
    case "all":
      return reviews;
    case "positive":
      return reviews.filter((r) => r.rating >= 4);
    case "neutral":
      return reviews.filter((r) => r.rating === 3);
    case "negative":
      return reviews.filter((r) => r.rating <= 2);
    case "not-replied":
      return reviews.filter((r) => r.reply === undefined);
  }
}

function applySort(reviews: Review[], sort: ReviewSort): Review[] {
  const copy = [...reviews];
  switch (sort) {
    case "recent":
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "highest":
      return copy.sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.createdAt.localeCompare(a.createdAt);
      });
    case "lowest":
      return copy.sort((a, b) => {
        if (a.rating !== b.rating) return a.rating - b.rating;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }
}

interface IdParams {
  id: string;
}

function validateReplyText(
  raw: unknown,
  reply: FastifyReply,
):
  | { ok: true; text: string }
  | { ok: false; response: ReturnType<typeof fail> } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {
      ok: false,
      response: fail(reply, {
        code: "INVALID_REPLY",
        message: "Reply text is required",
        status: 400,
      }),
    };
  }
  const trimmed = raw.trim();
  if (trimmed.length > MAX_REPLY_LENGTH) {
    return {
      ok: false,
      response: fail(reply, {
        code: "INVALID_REPLY_LENGTH",
        message: `Reply must be ${MAX_REPLY_LENGTH} characters or fewer`,
        status: 400,
      }),
    };
  }
  return { ok: true, text: trimmed };
}

export async function reviewsRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      page?: string;
      pageSize?: string;
      rating?: string;
      filter?: string;
      sort?: string;
    };
  }>("/reviews", async (req, reply) => {
    const seeded = await isSeededRequest(req);
    if (!seeded) {
      // New partner — empty review list + zero summary so the page
      // shows the "No reviews yet" empty state.
      return ok(reply, {
        items: [],
        summary: {
          average: 0,
          total: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          positiveRate: 0,
          responseRate: 0,
          unrepliedCount: 0,
        },
        total: 0,
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
      });
    }
    const page = clampPositiveInt(req.query.page, 1, 100_000);
    const pageSize = clampPositiveInt(
      req.query.pageSize,
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

    // Two filter dimensions:
    //   ?rating=N          — exact-rating filter (legacy; PR-8A dropdown).
    //   ?filter=positive…  — sentiment buckets (PR-8C tabs).
    // Apply both if both are sent. `filter=all` is a no-op.
    let ratingFilter: ReviewRating | null = null;
    const ratingParam = req.query.rating;
    if (ratingParam !== undefined && ratingParam !== "") {
      const n = Number(ratingParam);
      if (!isReviewRating(n)) {
        return fail(reply, {
          code: "INVALID_FILTER",
          message: `rating must be an integer 1-5, got ${ratingParam}`,
          status: 400,
        });
      }
      ratingFilter = n;
    }

    let filter: ReviewFilter = "all";
    const filterParam = req.query.filter;
    if (filterParam !== undefined && filterParam !== "") {
      if (!isFilter(filterParam)) {
        return fail(reply, {
          code: "INVALID_FILTER",
          message: `Unknown filter: ${filterParam}`,
          status: 400,
        });
      }
      filter = filterParam;
    }

    let sort: ReviewSort = "recent";
    const sortParam = req.query.sort;
    if (sortParam !== undefined && sortParam !== "") {
      if (!isSort(sortParam)) {
        return fail(reply, {
          code: "INVALID_SORT",
          message: `Unknown sort: ${sortParam}`,
          status: 400,
        });
      }
      sort = sortParam;
    }

    // Aggregate from the unfiltered list — KPI cards stay stable as
    // the user toggles filters.
    const summary = computeReviewSummary(mockReviews);

    let filtered = applyFilter(mockReviews, filter);
    if (ratingFilter !== null) {
      filtered = filtered.filter((r) => r.rating === ratingFilter);
    }
    const sorted = applySort(filtered, sort);
    const startIdx = (page - 1) * pageSize;
    const items = sorted.slice(startIdx, startIdx + pageSize);

    return ok(reply, {
      items,
      summary,
      total: filtered.length,
      page,
      pageSize,
    });
  });

  app.post<{ Params: IdParams }>(
    "/reviews/:id/reply",
    async (req, reply) => {
      const idx = mockReviews.findIndex((r) => r.id === req.params.id);
      if (idx < 0) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Review not found",
          status: 404,
        });
      }
      if (mockReviews[idx].reply) {
        return fail(reply, {
          code: "ALREADY_REPLIED",
          message: "You've already replied to this review. Edit it instead.",
          status: 409,
        });
      }
      const body = (req.body ?? {}) as { text?: unknown };
      const validated = validateReplyText(body.text, reply);
      if (!validated.ok) return validated.response;
      const replyObj: ReviewReply = {
        text: validated.text,
        createdAt: new Date().toISOString(),
      };
      mockReviews[idx] = { ...mockReviews[idx], reply: replyObj };
      return ok(reply, mockReviews[idx], 201);
    },
  );

  app.patch<{ Params: IdParams }>(
    "/reviews/:id/reply",
    async (req, reply) => {
      const idx = mockReviews.findIndex((r) => r.id === req.params.id);
      if (idx < 0) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Review not found",
          status: 404,
        });
      }
      const existingReply = mockReviews[idx].reply;
      if (!existingReply) {
        return fail(reply, {
          code: "NO_REPLY",
          message: "No reply to edit",
          status: 404,
        });
      }
      const body = (req.body ?? {}) as { text?: unknown };
      const validated = validateReplyText(body.text, reply);
      if (!validated.ok) return validated.response;
      const replyObj: ReviewReply = {
        ...existingReply,
        text: validated.text,
        updatedAt: new Date().toISOString(),
      };
      mockReviews[idx] = { ...mockReviews[idx], reply: replyObj };
      return ok(reply, mockReviews[idx]);
    },
  );

  app.delete<{ Params: IdParams }>(
    "/reviews/:id/reply",
    async (req, reply) => {
      const idx = mockReviews.findIndex((r) => r.id === req.params.id);
      if (idx < 0) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Review not found",
          status: 404,
        });
      }
      if (!mockReviews[idx].reply) {
        return fail(reply, {
          code: "NO_REPLY",
          message: "No reply to delete",
          status: 404,
        });
      }
      const next: Review = { ...mockReviews[idx] };
      delete next.reply;
      mockReviews[idx] = next;
      return noContent(reply);
    },
  );
}
