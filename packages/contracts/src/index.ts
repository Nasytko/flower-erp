export const API_VERSION = 'v1' as const;
export const API_PREFIX = `api/${API_VERSION}` as const;

export type RequestId = string;

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details: unknown[];
    requestId: RequestId;
  };
};

export type PaginationParams = {
  page?: number;
  pageSize?: number;
};

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type HealthLiveResponse = {
  status: 'ok';
  service: string;
  timestamp: string;
};

export type HealthReadyResponse = {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  checks: {
    database: 'up' | 'down';
  };
};

export function createApiErrorBody(input: {
  code: string;
  message: string;
  requestId: RequestId;
  details?: unknown[];
}): ApiErrorBody {
  return {
    error: {
      code: input.code,
      message: input.message,
      details: input.details ?? [],
      requestId: input.requestId,
    },
  };
}
