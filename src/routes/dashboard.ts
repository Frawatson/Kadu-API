/**
 * Dashboard summary — Figma 1080:711 (loaded) + 1258:19101 (empty).
 *
 * Honours `?empty=1` to return the zero-state shape so the empty-
 * state UI is reachable without mutating fixtures. Translated from
 * the MSW handler with no logic changes.
 */

import type { FastifyInstance } from "fastify";
import { ok } from "../lib/envelope.js";
import { isSeededRequest } from "../lib/partner-context.js";
import { mockOrders } from "../state/fixtures.js";
import type { MaterialsOrder } from "../types/order.js";

type SetupItemKey = "profile" | "hours" | "photos" | "catalog";
interface SetupItem {
  key: SetupItemKey;
  label: string;
  done: boolean;
}

const SETUP_ITEMS_LOADED: SetupItem[] = [
  { key: "profile", label: "Profile", done: true },
  { key: "hours", label: "Hours", done: true },
  { key: "photos", label: "Photos", done: false },
  { key: "catalog", label: "Catalog Item", done: false },
];

const SETUP_ITEMS_EMPTY: SetupItem[] = [
  { key: "profile", label: "Profile", done: false },
  { key: "hours", label: "Hours", done: false },
  { key: "photos", label: "Photos", done: false },
  { key: "catalog", label: "Catalog Item", done: false },
];

function percentDone(items: SetupItem[]): number {
  if (items.length === 0) return 0;
  const done = items.filter((i) => i.done).length;
  return Math.round((done / items.length) * 100);
}

const REVENUE_TREND_LOADED = [
  { date: "2026-04-28", value: 80000 },
  { date: "2026-04-29", value: 95000 },
  { date: "2026-04-30", value: 88000 },
  { date: "2026-05-01", value: 110000 },
  { date: "2026-05-02", value: 102000 },
  { date: "2026-05-03", value: 100000 },
  { date: "2026-05-04", value: 124000 },
];

const LOW_STOCK_ALERTS_LOADED = [
  { itemId: "lsa-001", name: "Premium Cement", quantityRemaining: 2 },
  { itemId: "lsa-002", name: "Eco-Friendly Paint", quantityRemaining: 4 },
  { itemId: "lsa-003", name: "Stainless Steel Sink", quantityRemaining: 3 },
  { itemId: "lsa-004", name: "Recycled Wood Planks", quantityRemaining: 1 },
];

function buildLoaded() {
  const items = SETUP_ITEMS_LOADED;
  const recent: MaterialsOrder[] = [...mockOrders]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);
  return {
    setup: { percentComplete: percentDone(items), items },
    kpis: {
      pendingOrders: 12,
      todaysRevenue: 124000,
      todaysRevenueChangePct: 15,
      lowStockItems: LOW_STOCK_ALERTS_LOADED.length,
      rating: 4.8,
      reviewCount: 43,
    },
    revenueTrend: { range: "7d" as const, points: REVENUE_TREND_LOADED },
    lowStockAlerts: LOW_STOCK_ALERTS_LOADED,
    recentOrders: recent,
  };
}

function buildEmpty() {
  return {
    setup: {
      percentComplete: percentDone(SETUP_ITEMS_EMPTY),
      items: SETUP_ITEMS_EMPTY,
    },
    kpis: {
      pendingOrders: 0,
      todaysRevenue: 0,
      todaysRevenueChangePct: null,
      lowStockItems: 0,
      rating: 0,
      reviewCount: 0,
    },
    revenueTrend: { range: "7d" as const, points: [] },
    lowStockAlerts: [],
    recentOrders: [],
  };
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empty?: string } }>(
    "/dashboard/summary",
    async (req, reply) => {
      // Newly-onboarded partners get the empty-state shape; the
      // seeded demo partner gets the full loaded fixtures unless
      // `?empty=1` is passed for design QA.
      const seeded = await isSeededRequest(req);
      const force = req.query.empty === "1";
      const summary = seeded && !force ? buildLoaded() : buildEmpty();
      return ok(reply, summary);
    },
  );
}
