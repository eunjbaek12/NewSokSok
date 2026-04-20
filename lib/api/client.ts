import { fetch } from 'expo/fetch';
import Constants from 'expo-constants';
import { QueryClient, type QueryFunction } from '@tanstack/react-query';
import type { ZodSchema } from 'zod';
import { ApiError, ApiNetworkError, ApiParseError, ApiTimeoutError } from './errors';

/**
 * Resolve the Express API base URL.
 *  - Production: https://<EXPO_PUBLIC_DOMAIN>
 *  - Development: http://<hostIp>:5000 (hostIp from Expo debuggerHost, fallback localhost)
 *
 * This is the ONLY place API_BASE is derived. Replaces the 4 divergent forms
 * scattered across AuthContext / VocabContext / lib/translation-api / lib/naver-dict-api.
 */
export function resolveApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;

  const debuggerHost = (Constants as any)?.expoConfig?.hostUri as string | undefined;
  const hostIp = debuggerHost ? debuggerHost.split(':')[0] : 'localhost';
  return `http://${hostIp}:5000`;
}

export interface ApiFetchOptions<T> {
  schema: ZodSchema<T>;
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export async function apiFetch<T>(path: string, opts: ApiFetchOptions<T>): Promise<T> {
  const {
    schema,
    method = 'GET',
    body,
    token,
    headers = {},
    timeout = DEFAULT_TIMEOUT_MS,
    signal,
  } = opts;

  const base = resolveApiBase();
  const url = new URL(path, base).toString();

  const finalHeaders: Record<string, string> = { ...headers };
  if (body !== undefined && !('Content-Type' in finalHeaders)) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  if (token) {
    finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') {
      throw new ApiTimeoutError(timeout);
    }
    throw new ApiNetworkError(e?.message ?? 'Network error', e);
  }
  clearTimeout(timer);

  if (!res.ok) {
    let errBody: unknown;
    try {
      errBody = await res.json();
    } catch {
      try { errBody = await res.text(); } catch { errBody = undefined; }
    }
    const message = typeof errBody === 'object' && errBody && 'error' in (errBody as any)
      ? String((errBody as any).error)
      : `HTTP ${res.status}`;
    throw new ApiError(res.status, message, errBody);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (e: any) {
    throw new ApiParseError('Response is not JSON', e, undefined);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiParseError('Response failed schema validation', parsed.error, json);
  }
  return parsed.data;
}

// ---- TanStack Query client (absorbed from former lib/query-client.ts) -------

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// ---- Back-compat helpers (used by legacy call sites until step 4 migration) -

type UnauthorizedBehavior = 'returnNull' | 'throw';

/**
 * @deprecated Use `apiFetch` with a Zod schema. Kept for legacy call sites
 * in lib/translation-api / lib/naver-dict-api until step 4/8 migration.
 */
export async function apiRequest(
  method: string,
  route: string,
  data?: unknown,
): Promise<Response> {
  const url = new URL(route, resolveApiBase()).toString();
  const res = await fetch(url, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new ApiError(res.status, `${res.status}: ${text}`, text);
  }
  return res;
}

/** @deprecated Same as above. */
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401 }) =>
    async ({ queryKey }) => {
      const url = new URL(queryKey.join('/') as string, resolveApiBase()).toString();
      const res = await fetch(url, { credentials: 'include' });
      if (on401 === 'returnNull' && res.status === 401) return null as any;
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new ApiError(res.status, `${res.status}: ${text}`, text);
      }
      return (await res.json()) as any;
    };

/** @deprecated Use `resolveApiBase()`. */
export function getApiUrl(): string {
  return resolveApiBase();
}
