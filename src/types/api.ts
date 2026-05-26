/**
 * API envelope types — mirrors the backend's Option B response contract.
 * Success: { data, meta }
 * Error:   { error, meta }
 */

export interface ApiMeta {
  requestId: string;
  serverTime: string;
}

export interface ApiSuccessResponse<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
  meta: ApiMeta;
}

/** Normalised error thrown by the API client */
export interface AppError {
  code: string;
  message: string;
  retryable: boolean;
  status: number;
}

/** Paginated list wrapper */
export interface PaginatedList<T> {
  items: T[];
  total: number;
  cursor?: string;
  hasMore: boolean;
}
