import type { ApiResponse, ApiError } from '@morpheus/shared';

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
  const json = (await response.json()) as ApiResponse<T> | ApiError;

  if (!response.ok || !json.success) {
    const error = json as ApiError;
    throw new Error(error.message ?? 'Request failed');
  }

  return (json as ApiResponse<T>).data;
}
