import { API_BASE } from './apiConfig';
const REQUEST_TIMEOUT = 15000;

export type ApiErrorPayload = { error?: string; message?: string; details?: unknown; problem?: { type?: string; title?: string } };

export class ApiRequestError extends Error {
  readonly retryable: boolean;

  constructor(readonly status: number, message: string, readonly payload?: ApiErrorPayload) {
    super(message);
    this.name = 'ApiRequestError';
    this.retryable = status === 0 || status === 408 || status === 429 || status >= 500;
  }
}

function reportApiError(error: ApiRequestError) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nstp-api-error', { detail: error }));
}

async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(input, { ...init, credentials: 'include', signal: controller.signal });
    if (typeof window !== 'undefined' && response.status === 401) window.dispatchEvent(new Event('auth:expired'));
    if (typeof window !== 'undefined' && response.status === 403) window.dispatchEvent(new Event('auth:forbidden'));
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(input: RequestInfo, init: RequestInit = {}, retries = 3): Promise<Response> {
  const safeToRetry = (init.method || 'GET').toUpperCase() === 'GET';
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetchWithTimeout(input, init);
      if (response.status === 401 || response.status === 403) return response;
      if (!safeToRetry || ![408, 429].includes(response.status) && response.status < 500 || attempt === retries - 1) return response;
    } catch (error) {
      if (!safeToRetry || attempt === retries - 1) {
        throw new ApiRequestError(0, error instanceof Error && error.name === 'AbortError' ? 'Request timed out.' : 'Network request failed.');
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new ApiRequestError(0, 'Request retry limit reached.');
}

async function request<T>(method: string, path: string, payload?: unknown): Promise<T> {
  try {
    const response = await fetchWithRetry(`${API_BASE}${path}`, {
      method,
      headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    if (!response.ok) {
      let body: ApiErrorPayload | undefined;
      try { body = await response.json() as ApiErrorPayload; } catch { /* response body is optional */ }
      throw new ApiRequestError(response.status, body?.error || body?.message || `Request failed with status ${response.status}.`, body);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    const apiError = error instanceof ApiRequestError ? error : new ApiRequestError(0, 'Network request failed.');
    reportApiError(apiError);
    throw apiError;
  }
}

// The legacy fallback argument remains source-compatible but is deliberately ignored:
// a failed response must never be interpreted as successful fallback data.
export async function apiPut<T>(path: string, payload: unknown, _fallback?: T): Promise<T> { return request<T>('PUT', path, payload); }
export async function apiPatch<T>(path: string, payload: unknown, _fallback?: T): Promise<T> { return request<T>('PATCH', path, payload); }
export async function apiGet<T>(path: string, _fallback?: T): Promise<T> { return request<T>('GET', path); }
export async function apiDel<T>(path: string, _fallback?: T): Promise<T> { return request<T>('DELETE', path); }
export async function apiPost<T>(path: string, payload: unknown, _fallback?: T): Promise<T> { return request<T>('POST', path, payload); }
