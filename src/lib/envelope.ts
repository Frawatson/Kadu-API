/**
 * Match the frontend's envelope shape exactly so `apiClient`
 * unwraps successes and normalises errors without changes.
 *
 *   Success: { data, meta: { requestId, serverTime } }
 *   Error:   { error: { code, message, retryable }, meta }
 */

import type { FastifyReply } from "fastify";

let counter = 0;
function meta(requestId?: string) {
  return {
    requestId: requestId ?? `req_${Date.now()}_${++counter}`,
    serverTime: new Date().toISOString(),
  };
}

export function ok<T>(reply: FastifyReply, data: T, status = 200) {
  return reply.code(status).send({ data, meta: meta() });
}

export function noContent(reply: FastifyReply) {
  return reply.code(204).send();
}

export function fail(
  reply: FastifyReply,
  opts: {
    code: string;
    message: string;
    status?: number;
    retryable?: boolean;
  },
) {
  return reply.code(opts.status ?? 400).send({
    error: {
      code: opts.code,
      message: opts.message,
      retryable: opts.retryable ?? false,
    },
    meta: meta(),
  });
}
