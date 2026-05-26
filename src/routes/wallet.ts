/**
 * Wallet — summary, transactions, payout methods, withdrawals.
 * Phase 7 consumer.
 */

import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { fail, noContent, ok } from "../lib/envelope.js";
import {
  isSeededRequest,
  payoutMethodsForPartner,
  trySubjectId,
} from "../lib/partner-context.js";
import { prisma } from "../lib/prisma.js";
import { mockTransactions, mockWallet } from "../state/fixtures.js";
import type {
  PayoutMethod,
  TransactionType,
  WithdrawalRecord,
} from "../types/wallet.js";

async function resolvePayoutMethods(
  req: FastifyRequest,
): Promise<PayoutMethod[] | null> {
  const sub = await trySubjectId(req);
  if (sub === null) return null;
  const partner = await prisma.partner.findUnique({ where: { id: sub } });
  if (!partner) return null;
  return payoutMethodsForPartner(partner);
}

function fail401(reply: FastifyReply) {
  return fail(reply, {
    code: "UNAUTHORIZED",
    message: "Sign in to manage payout methods",
    status: 401,
  });
}

const CREDIT_TYPES = new Set<TransactionType>(["EARNING"]);
const DEBIT_TYPES = new Set<TransactionType>(["WITHDRAWAL", "REFUND_DEBIT"]);
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function calcFee(amountCents: number): number {
  return Math.max(50, Math.ceil(amountCents * 0.01));
}

function clampPositiveInt(raw: string | undefined, fallback: number, max: number) {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.floor(parsed));
}

/**
 * Parse a `YYYY-MM-DD` query param into a millisecond timestamp.
 * Snaps "from" to 00:00:00 UTC and "to" to 23:59:59.999 UTC so a
 * single-day range is inclusive of records created later in the day.
 */
function parseDateBound(
  raw: string | undefined,
  bound: "start" | "end",
): number | null {
  if (!raw) return null;
  const iso =
    bound === "start" ? `${raw}T00:00:00.000Z` : `${raw}T23:59:59.999Z`;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : null;
}

interface IdParams {
  id: string;
}

const EMPTY_WALLET = {
  availableBalance: 0,
  pendingBalance: 0,
  totalEarned: 0,
  currency: "USD" as const,
};

export async function walletRoutes(app: FastifyInstance) {
  app.get("/wallet", async (req, reply) => {
    const seeded = await isSeededRequest(req);
    return ok(reply, seeded ? mockWallet : EMPTY_WALLET);
  });

  app.get<{
    Querystring: {
      type?: string;
      q?: string;
      page?: string;
      pageSize?: string;
      from?: string;
      to?: string;
    };
  }>("/wallet/transactions", async (req, reply) => {
    const seeded = await isSeededRequest(req);
    if (!seeded) {
      return ok(reply, { items: [], total: 0, page: 1, pageSize: 20 });
    }
    const typeParam = req.query.type?.toLowerCase() ?? "all";
    const q = req.query.q?.trim().toLowerCase() ?? "";
    const page = clampPositiveInt(req.query.page, 1, 100_000);
    const pageSize = clampPositiveInt(
      req.query.pageSize,
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const fromTs = parseDateBound(req.query.from, "start");
    const toTs = parseDateBound(req.query.to, "end");

    if (typeParam !== "all" && typeParam !== "credit" && typeParam !== "debit") {
      return fail(reply, {
        code: "INVALID_FILTER",
        message: `Unknown type filter: ${typeParam}`,
        status: 400,
      });
    }

    const filtered = mockTransactions.filter((tx) => {
      if (typeParam === "credit" && !CREDIT_TYPES.has(tx.type)) return false;
      if (typeParam === "debit" && !DEBIT_TYPES.has(tx.type)) return false;
      if (fromTs !== null && Date.parse(tx.createdAt) < fromTs) return false;
      if (toTs !== null && Date.parse(tx.createdAt) > toTs) return false;
      if (q.length > 0) {
        const haystack = `${tx.description} ${tx.orderId ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const startIdx = (page - 1) * pageSize;
    const paged = filtered.slice(startIdx, startIdx + pageSize);

    return ok(reply, {
      items: paged,
      total: filtered.length,
      page,
      pageSize,
    });
  });

  app.get("/wallet/payout-methods", async (req, reply) => {
    const arr = (await resolvePayoutMethods(req)) ?? [];
    return ok(reply, arr);
  });

  app.post("/wallet/payout-methods", async (req, reply) => {
    const arr = await resolvePayoutMethods(req);
    if (arr === null) return fail401(reply);
    const body = (req.body ?? {}) as Partial<PayoutMethod>;
    if (body.type !== "MOBILE_MONEY" && body.type !== "BANK_TRANSFER") {
      return fail(reply, {
        code: "INVALID_PAYOUT_TYPE",
        message: "type must be MOBILE_MONEY or BANK_TRANSFER",
        status: 400,
      });
    }
    const isFirst = arr.length === 0;
    const isDefault = isFirst || (body.isDefault ?? false);
    const created = {
      ...body,
      id: `pm-${Date.now()}`,
      isDefault,
    } as PayoutMethod;
    if (isDefault) {
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        if (m.isDefault) arr[i] = { ...m, isDefault: false };
      }
    }
    arr.push(created);
    return ok(reply, created, 201);
  });

  app.patch<{ Params: IdParams }>(
    "/wallet/payout-methods/:id",
    async (req, reply) => {
      const arr = await resolvePayoutMethods(req);
      if (arr === null) return fail401(reply);
      const id = req.params.id;
      const idx = arr.findIndex((m) => m.id === id);
      if (idx < 0) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: `Payout method ${id} not found`,
          status: 404,
        });
      }
      const patch = (req.body ?? {}) as Partial<PayoutMethod>;
      if (patch.isDefault === true) {
        for (let i = 0; i < arr.length; i++) {
          const m = arr[i];
          if (i === idx) continue;
          if (m.isDefault) arr[i] = { ...m, isDefault: false };
        }
        const target = arr[idx];
        arr[idx] = { ...target, isDefault: true } as PayoutMethod;
      } else if (patch.isDefault === false) {
        return fail(reply, {
          code: "INVALID_DEFAULT_FLIP",
          message: "Promote another method to default before unsetting this one",
          status: 409,
        });
      }
      return ok(reply, arr[idx]);
    },
  );

  app.delete<{ Params: IdParams }>(
    "/wallet/payout-methods/:id",
    async (req, reply) => {
      const arr = await resolvePayoutMethods(req);
      if (arr === null) return fail401(reply);
      const id = req.params.id;
      const idx = arr.findIndex((m) => m.id === id);
      if (idx < 0) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: `Payout method ${id} not found`,
          status: 404,
        });
      }
      const target = arr[idx];
      if (target.isDefault && arr.length > 1) {
        return fail(reply, {
          code: "DEFAULT_DELETE_BLOCKED",
          message: "Set another method as default before deleting this one",
          status: 409,
        });
      }
      arr.splice(idx, 1);
      return noContent(reply);
    },
  );

  app.post("/wallet/withdrawals", async (req, reply) => {
    const arr = await resolvePayoutMethods(req);
    if (arr === null) return fail401(reply);
    const body = (req.body ?? {}) as { amount?: number; payoutMethodId?: string };
    if (typeof body.amount !== "number" || body.amount <= 0) {
      return fail(reply, {
        code: "INVALID_AMOUNT",
        message: "amount must be a positive integer (cents)",
        status: 400,
      });
    }
    if (body.amount > mockWallet.availableBalance) {
      return fail(reply, {
        code: "INSUFFICIENT_BALANCE",
        message: "Withdrawal exceeds available balance",
        status: 409,
      });
    }
    const method = arr.find((m) => m.id === body.payoutMethodId);
    if (!method) {
      return fail(reply, {
        code: "PAYOUT_METHOD_NOT_FOUND",
        message: `Unknown payoutMethodId: ${body.payoutMethodId}`,
        status: 400,
      });
    }
    const fee = calcFee(body.amount);
    const now = new Date().toISOString();
    const record: WithdrawalRecord = {
      id: `wd-${Date.now()}`,
      amount: body.amount,
      fee,
      netAmount: body.amount - fee,
      currency: mockWallet.currency,
      payoutMethod: method,
      status: "PROCESSING",
      reference: `WD-${Date.now().toString(36).toUpperCase()}`,
      createdAt: now,
    };
    mockWallet.availableBalance -= body.amount;
    mockTransactions.unshift({
      id: `tx-${Date.now()}`,
      type: "WITHDRAWAL",
      description: `Withdrawal to ${method.label}`,
      amount: -body.amount,
      runningBalance: mockWallet.availableBalance,
      currency: mockWallet.currency,
      createdAt: now,
    });
    return ok(reply, record, 201);
  });
}
