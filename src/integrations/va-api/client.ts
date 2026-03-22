/**
 * HTTP client for the VendorAdmin AI Vendor External API.
 * Thin fetch-based wrapper that unwraps VaApiResponse and throws on failure.
 */

import type { VaApiResponse } from './types';

const BASE_URL = import.meta.env.VITE_VA_API_BASE_URL ?? 'http://localhost:29101';
const API_PREFIX = '/external/ai-vendor';

export class VaApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaApiError';
  }
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${API_PREFIX}${path}`, BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  } catch (err) {
    throw new VaApiError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    throw new VaApiError(`HTTP ${res.status}: ${res.statusText}`);
  }

  const json: VaApiResponse<T> = await res.json();
  if (!json.success) {
    throw new VaApiError(json.message ?? 'Unknown API error');
  }
  return json.data;
}

export const vaApi = {
  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return request<T>(buildUrl(path, params));
  },

  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(buildUrl(path), {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  put<T>(path: string, body?: unknown, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return request<T>(buildUrl(path, params), {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },
};
