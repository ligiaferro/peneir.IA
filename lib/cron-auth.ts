import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/** Valida `Authorization: Bearer <CRON_SECRET>`, enviado pela Vercel Cron. */
export function isCronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length &&
    timingSafeEqual(provided, expected)
  );
}
