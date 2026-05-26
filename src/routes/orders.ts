/**
 * Orders — list (with status tab filter), detail, lifecycle transitions.
 * Phase 5 consumer.
 */

import type { FastifyInstance } from "fastify";
import { fail, ok } from "../lib/envelope.js";
import { isSeededRequest } from "../lib/partner-context.js";
import { mockOrders } from "../state/fixtures.js";
import { ACTIVE_STATUSES, type MaterialsOrder, type OrderStatus } from "../types/order.js";

type TabFilter = "ACTIVE" | "COMPLETED" | "RETURNS" | "CANCELLED";

const FILTER_TO_STATUSES: Record<TabFilter, OrderStatus[]> = {
  ACTIVE: ACTIVE_STATUSES,
  COMPLETED: ["PICKED_UP"],
  RETURNS: ["RETURN_REQUESTED", "RETURN_CONFIRMED", "RETURN_REJECTED"],
  CANCELLED: ["CANCELLED"],
};

function isTabFilter(value: string): value is TabFilter {
  return (
    value === "ACTIVE" ||
    value === "COMPLETED" ||
    value === "RETURNS" ||
    value === "CANCELLED"
  );
}

/**
 * Parse a `YYYY-MM-DD` query param into a millisecond timestamp.
 * `bound = "start"` snaps to 00:00:00 UTC of that day; `"end"` snaps to
 * 23:59:59.999 UTC so a single-day range is inclusive of orders created
 * later in the day. Returns null for missing or invalid values so the
 * caller can skip the filter.
 */
function parseDate(raw: string | undefined, bound: "start" | "end"): number | null {
  if (!raw) return null;
  const iso = bound === "start" ? `${raw}T00:00:00.000Z` : `${raw}T23:59:59.999Z`;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : null;
}

function appendStatus(order: MaterialsOrder, next: OrderStatus): MaterialsOrder {
  const now = new Date().toISOString();
  return {
    ...order,
    status: next,
    statusHistory: [...order.statusHistory, { status: next, timestamp: now }],
    updatedAt: now,
  };
}

interface IdParams {
  id: string;
}

export async function ordersRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { status?: string; from?: string; to?: string };
  }>("/orders", async (req, reply) => {
    const seeded = await isSeededRequest(req);
    if (!seeded) return ok(reply, []);
    const filter = req.query.status;
    let items = mockOrders;
    if (filter && filter.length > 0) {
      if (!isTabFilter(filter)) {
        return fail(reply, {
          code: "INVALID_FILTER",
          message: `Unknown status filter: ${filter}`,
          status: 400,
        });
      }
      const allowed = new Set<OrderStatus>(FILTER_TO_STATUSES[filter]);
      items = items.filter((o) => allowed.has(o.status));
    }
    const fromTs = parseDate(req.query.from, "start");
    const toTs = parseDate(req.query.to, "end");
    if (fromTs !== null) items = items.filter((o) => Date.parse(o.createdAt) >= fromTs);
    if (toTs !== null) items = items.filter((o) => Date.parse(o.createdAt) <= toTs);
    return ok(reply, items);
  });

  app.get<{ Params: IdParams }>("/orders/:id", async (req, reply) => {
    const order = mockOrders.find((o) => o.id === req.params.id);
    if (!order) {
      return fail(reply, {
        code: "NOT_FOUND",
        message: `Order ${req.params.id} not found`,
        status: 404,
      });
    }
    return ok(reply, order);
  });

  app.post<{ Params: IdParams }>(
    "/orders/:id/confirm-items",
    async (req, reply) => {
      const idx = mockOrders.findIndex((o) => o.id === req.params.id);
      if (idx < 0) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Order not found",
          status: 404,
        });
      }
      const order = mockOrders[idx];
      if (order.status !== "NEW" && order.status !== "FUNDED") {
        return fail(reply, {
          code: "INVALID_STATE",
          message: `Order is ${order.status}; items can only be confirmed when NEW or FUNDED`,
          status: 409,
        });
      }
      const updated = appendStatus(order, "PREPARING");
      mockOrders[idx] = updated;
      return ok(reply, updated);
    },
  );

  app.post<{ Params: IdParams }>("/orders/:id/cancel", async (req, reply) => {
    const idx = mockOrders.findIndex((o) => o.id === req.params.id);
    if (idx < 0) {
      return fail(reply, {
        code: "NOT_FOUND",
        message: "Order not found",
        status: 404,
      });
    }
    const order = mockOrders[idx];
    const cancellable: OrderStatus[] = [
      "NEW",
      "FUNDED",
      "CONFIRMED",
      "PREPARING",
    ];
    if (!cancellable.includes(order.status)) {
      return fail(reply, {
        code: "INVALID_STATE",
        message: `Order is ${order.status}; cancellation is no longer possible`,
        status: 409,
      });
    }
    const updated = appendStatus(order, "CANCELLED");
    mockOrders[idx] = updated;
    return ok(reply, updated);
  });

  app.post<{ Params: IdParams }>(
    "/orders/:id/confirm-pickup",
    async (req, reply) => {
      const idx = mockOrders.findIndex((o) => o.id === req.params.id);
      if (idx < 0) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Order not found",
          status: 404,
        });
      }
      const order = mockOrders[idx];
      if (order.status !== "READY_FOR_PICKUP" && order.status !== "PREPARING") {
        return fail(reply, {
          code: "INVALID_STATE",
          message: `Order is ${order.status}; pickup can only be confirmed when ready`,
          status: 409,
        });
      }
      const updated = appendStatus(order, "PICKED_UP");
      mockOrders[idx] = updated;
      return ok(reply, updated);
    },
  );

  app.post<{ Params: IdParams }>(
    "/orders/:id/return-request/approve",
    async (req, reply) => {
      const idx = mockOrders.findIndex((o) => o.id === req.params.id);
      if (idx < 0) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Order not found",
          status: 404,
        });
      }
      const order = mockOrders[idx];
      if (order.status !== "RETURN_REQUESTED") {
        return fail(reply, {
          code: "INVALID_STATE",
          message: "No pending return request on this order",
          status: 409,
        });
      }
      const updated = appendStatus(order, "RETURN_CONFIRMED");
      mockOrders[idx] = updated;
      return ok(reply, updated);
    },
  );

  app.post<{ Params: IdParams }>(
    "/orders/:id/return-request/reject",
    async (req, reply) => {
      const idx = mockOrders.findIndex((o) => o.id === req.params.id);
      if (idx < 0) {
        return fail(reply, {
          code: "NOT_FOUND",
          message: "Order not found",
          status: 404,
        });
      }
      const order = mockOrders[idx];
      if (order.status !== "RETURN_REQUESTED") {
        return fail(reply, {
          code: "INVALID_STATE",
          message: "No pending return request on this order",
          status: 409,
        });
      }
      const updated = appendStatus(order, "RETURN_REJECTED");
      mockOrders[idx] = updated;
      return ok(reply, updated);
    },
  );
}
