/**
 * Kadu-API smoke-test backend.
 *
 * Boots Fastify with CORS for the partner frontend, JWT for partner
 * sessions, and routes for auth + general settings. Mounts everything
 * under `/api/v1` so the frontend's existing baseURL works unchanged.
 *
 * Env is loaded via Node's --env-file flag in the npm script (20.6+).
 */

import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { authRoutes } from "./routes/auth.js";
import { catalogRoutes } from "./routes/catalog.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { ordersRoutes } from "./routes/orders.js";
import { partnerRoutes } from "./routes/partner.js";
import { reviewsRoutes } from "./routes/reviews.js";
import { settingsRoutes } from "./routes/settings.js";
import { storesRoutes } from "./routes/stores.js";
import { walletRoutes } from "./routes/wallet.js";

const PORT = Number(process.env.PORT ?? 3003);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3002";
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET env var is required");
}

const app = Fastify({
  logger: { level: "info" },
  // Photos travel as base64 data URLs inside the JSON PATCH /stores/:id
  // body (smoke-test backend doesn't have real binary storage). 5 MB
  // per photo + base64 overhead + existing photos in the array can
  // easily clear the 1 MB Fastify default. 25 MB gives plenty of
  // headroom while still rejecting obvious abuse.
  bodyLimit: 25 * 1024 * 1024,
});

await app.register(cors, {
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

await app.register(jwt, {
  secret: JWT_SECRET,
});

// Accept multipart/form-data for the photo-upload routes. The smoke-test
// backend doesn't store binaries — we just drain the body and let the
// handler echo a fake URL. Done with `addContentTypeParser` rather than
// `@fastify/multipart` to avoid pulling a dep we'd otherwise never use.
app.addContentTypeParser(
  /^multipart\/form-data/,
  { parseAs: "buffer", bodyLimit: 10 * 1024 * 1024 },
  (_req, body, done) => done(null, body),
);

await app.register(
  async (api) => {
    await api.register(authRoutes);
    await api.register(partnerRoutes);
    await api.register(dashboardRoutes);
    await api.register(storesRoutes);
    await api.register(ordersRoutes);
    await api.register(catalogRoutes);
    await api.register(walletRoutes);
    await api.register(reviewsRoutes);
    await api.register(settingsRoutes);
    api.get("/health", async () => ({ status: "ok" }));
  },
  { prefix: "/api/v1" },
);

try {
  // Bind to `::` so the listener accepts both IPv4 and IPv6 — Windows
  // browsers resolve `localhost` to IPv6 first and would otherwise
  // miss an IPv4-only bind. Equivalent to dual-stack on most OSes.
  await app.listen({ port: PORT, host: "::" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
