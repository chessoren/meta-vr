import type { Handler } from './http';
import { bad } from './http';

/**
 * Route table: path → handler. Filled in by the import pipeline (pair / extract / palace).
 * Keep this the single source of truth; api/[...route].ts and the dev middleware both read it.
 */
export const routes: Record<string, Handler> = {
  '/api/health': async () => ({ status: 200, json: { ok: true } }),
};

export async function dispatch(path: string, req: Parameters<Handler>[0]) {
  const h = routes[path];
  if (!h) return bad(`No route ${path}`, 404);
  try {
    return await h(req);
  } catch (e) {
    console.error('[api]', path, e);
    return bad(e instanceof Error ? e.message : 'Internal error', 500);
  }
}
