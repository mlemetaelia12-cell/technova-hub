import { NextResponse } from 'next/server';

const buckets = new Map<string, { count: number; resetAt: number }>();

// Best-effort process-local throttling. Use an edge/WAF or shared store for multi-instance production.
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > 10000) {
    for (const [entry, value] of buckets) if (value.resetAt <= now) buckets.delete(entry);
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Non-browser clients still require authentication and validation.
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function forbiddenOrigin() {
  return NextResponse.json({ error: 'Request origin not allowed' }, { status: 403 });
}
