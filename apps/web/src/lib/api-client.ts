import type { ApiResponse, ApiError } from '@morpheus/shared';

function nonJsonError(response: Response, body: string): Error {
  const vercelError = response.headers.get('x-vercel-error');
  const preview = body.replace(/\s+/g, ' ').trim().slice(0, 120);
  const parts = [`API ${response.status}`];
  if (vercelError) parts.push(`(${vercelError})`);
  parts.push(preview ? `: ${preview}` : ': empty non-JSON body');
  return new Error(parts.join(' '));
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(path, { ...fetchOptions, headers });
  const text = await response.text();

  let json: ApiResponse<T> | ApiError;
  try {
    json = JSON.parse(text) as ApiResponse<T> | ApiError;
  } catch {
    throw nonJsonError(response, text);
  }

  if (!response.ok || !json.success) {
    const error = json as ApiError;
    throw new Error(error.message ?? 'Request failed');
  }

  return (json as ApiResponse<T>).data;
}
