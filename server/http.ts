/** Framework-agnostic request/response used by both Vercel functions (api/*) and the Vite dev middleware. */
export interface ApiRequest {
  method: string;
  path: string; // e.g. "/api/pair"
  query: Record<string, string>;
  body: unknown; // parsed JSON (or undefined)
  /** Lower-cased request headers (optional: unit tests may omit them). */
  headers?: Record<string, string>;
}

export interface ApiResponse {
  status: number;
  json: unknown;
  /** Extra response headers (e.g. retry-after). */
  headers?: Record<string, string>;
}

export type Handler = (req: ApiRequest) => Promise<ApiResponse>;

export const ok = (json: unknown): ApiResponse => ({ status: 200, json });
export const bad = (message: string, status = 400, extra?: Record<string, unknown>): ApiResponse => ({
  status,
  json: { error: message, ...extra },
});

/** Thrown by handlers/validators to produce a clean 4xx. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Hard cap on request bodies read by the adapters (bytes). Vercel itself caps function bodies at ~4.5 MB. */
export const MAX_BODY_BYTES = 16 * 1024 * 1024;
