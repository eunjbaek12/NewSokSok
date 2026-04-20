import type { ZodError } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export class ApiParseError extends Error {
  readonly zodError: ZodError;
  readonly raw: unknown;

  constructor(message: string, zodError: ZodError, raw: unknown) {
    super(message);
    this.name = 'ApiParseError';
    this.zodError = zodError;
    this.raw = raw;
  }
}

export class ApiNetworkError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'ApiNetworkError';
    this.cause = cause;
  }
}

export class ApiTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'ApiTimeoutError';
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function isApiParseError(err: unknown): err is ApiParseError {
  return err instanceof ApiParseError;
}
