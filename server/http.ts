/** Framework-agnostic request/response used by both Vercel functions (api/*) and the Vite dev middleware. */
export interface ApiRequest {
  method: string;
  path: string; // e.g. "/api/pair"
  query: Record<string, string>;
  body: unknown; // parsed JSON (or undefined)
}

export interface ApiResponse {
  status: number;
  json: unknown;
}

export type Handler = (req: ApiRequest) => Promise<ApiResponse>;

export const ok = (json: unknown): ApiResponse => ({ status: 200, json });
export const bad = (message: string, status = 400): ApiResponse => ({ status, json: { error: message } });
