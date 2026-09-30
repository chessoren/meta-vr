/** Phone → server calls, with typed, human-readable errors. */
import type { ExtractResponse, Palace, PairStatus } from '../core/types';
import type { ExtractRequestIn } from '../../server/api-types';

export type ApiErrorKind = 'expired' | 'too-big' | 'network' | 'rate' | 'invalid' | 'server' | 'timeout';

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

function errorFor(status: number, body: { error?: string } | undefined): ApiError {
  const msg = body?.error ?? '';
  if (status === 404) return new ApiError('expired', 'This code has expired or does not exist.', status);
  if (status === 413) return new ApiError('too-big', msg.replace(/^[\w.[\]]+: /, '') || 'That file is too large.', status);
  if (status === 429) return new ApiError('rate', 'Too many tries — wait a minute and try again.', status);
  if (status >= 400 && status < 500) return new ApiError('invalid', msg || 'Something in the request was not accepted.', status);
  return new ApiError('server', 'The Loci server had a hiccup. Please try again.', status);
}

async function json<T>(res: Response): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (!res.ok) throw errorFor(res.status, body as { error?: string });
  return body as T;
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { ...init, signal: ctl.signal, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
    return await json<T>(res);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error)?.name === 'AbortError') throw new ApiError('timeout', 'The server took too long to answer.');
    throw new ApiError('network', 'No connection — check your Wi-Fi or data and try again.');
  } finally {
    clearTimeout(t);
  }
}

export function checkCode(code: string): Promise<{ status: PairStatus; expiresAt: number }> {
  return request(`/api/pair?code=${encodeURIComponent(code)}`);
}

export function sendPalace(code: string, palace: Omit<Palace, 'createdAt'> & { createdAt?: number }): Promise<{ ok: true; notions: number }> {
  return request('/api/palace', { method: 'POST', body: JSON.stringify({ code, palace }) }, 30_000);
}

/**
 * POST /api/extract through XHR so the upload shows real progress.
 * onProgress(fraction 0..1) during upload; onUploaded() once the server has everything and is working.
 */
export function extract(
  req: ExtractRequestIn,
  cb: { onProgress?: (f: number) => void; onUploaded?: () => void } = {},
  timeoutMs = 90_000,
): Promise<ExtractResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/extract');
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.timeout = timeoutMs;
    let uploaded = false;
    const markUploaded = () => {
      if (!uploaded) {
        uploaded = true;
        cb.onProgress?.(1);
        cb.onUploaded?.();
      }
    };
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) cb.onProgress?.(e.loaded / e.total);
    };
    xhr.upload.onload = markUploaded;
    xhr.onload = () => {
      markUploaded();
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body as ExtractResponse);
      else reject(errorFor(xhr.status, body as { error?: string }));
    };
    xhr.onerror = () => reject(new ApiError('network', 'No connection — check your Wi-Fi or data and try again.'));
    xhr.ontimeout = () => reject(new ApiError('timeout', 'Building took too long. Try again, or paste a shorter part of the course.'));
    xhr.send(JSON.stringify(req));
  });
}
