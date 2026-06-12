export const MIKOMIKU_OBJECTIVE_INTERNAL_ACTOR =
  "makxas-search:objective-v1";

function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization")?.trim();
  if (!auth) return null;

  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function authenticateMikomikuObjectiveInternalRequest(
  req: Request,
): string | null {
  const expected = process.env.MIKOMIKU_OBJECTIVE_INTERNAL_TOKEN?.trim();
  if (!expected) return null;

  const actual = bearerToken(req);
  if (actual !== expected) return null;

  return MIKOMIKU_OBJECTIVE_INTERNAL_ACTOR;
}
