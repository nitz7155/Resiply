const API_BASE_URL = '/api'; // keep without trailing slash to avoid double slashes


const buildUrl = (url: string, params?: Record<string, unknown>) => {
  // normalize base and path so we never produce double slashes like '/api//foo'
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const path = url.startsWith('/') ? url : `/${url}`;
  const target = new URL(`${base}${path}`, window.location.origin);

  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        target.searchParams.append(k, String(v));
      }
    });
  }

  return target.toString();
};

type RequestOptions = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
};

export class ApiError extends Error {
  status: number;
  bodyText?: string;

  constructor(message: string, status: number, bodyText?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.bodyText = bodyText;
  }
}

async function request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    data?: unknown,
    params?: Record<string, unknown>,
    options?: RequestOptions
): Promise<T> {
  const finalUrl = buildUrl(url, params);

  const defaultHeaders: Record<string, string> = {};
  if (data !== undefined && data !== null) {
    defaultHeaders['Content-Type'] = 'application/json; charset=utf-8';
  }

  const res = await fetch(finalUrl, {
    method,
    credentials: options?.credentials ?? 'include',
    headers: {...defaultHeaders, ...(options?.headers ?? {})},
    signal: options?.signal,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  // try to parse json, fall back to text if empty
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
  } catch {
    return (text as unknown) as T;
  }
}

const apiClient = {
  get: <T>(url: string, params?: Record<string, unknown>, options?: RequestOptions) =>
      request<T>('GET', url, undefined, params, options),
  post: <T>(url: string, data?: unknown, options?: RequestOptions) =>
      request<T>('POST', url, data, undefined, options),
  put: <T>(url: string, data?: unknown, options?: RequestOptions) =>
      request<T>('PUT', url, data, undefined, options),
  patch: <T>(url: string, data?: unknown, options?: RequestOptions) =>
      request<T>('PATCH', url, data, undefined, options),
  delete: <T>(url: string, params?: Record<string, unknown>, options?: RequestOptions) =>
      request<T>('DELETE', url, undefined, params, options),
};

export default apiClient;