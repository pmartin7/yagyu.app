export interface ApiResponse<T> {
  data: T;
  success: true;
}

export interface ApiError {
  success: false;
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}
