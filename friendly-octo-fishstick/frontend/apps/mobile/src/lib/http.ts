/**
 * One error shape and one fetch wrapper for every provider call.
 *
 * `AppError.code` is stable (`provider_auth_error`, `timeout`, …) so screens
 * can branch on it instead of matching on prose.
 */

export class AppError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  retryable: boolean;

  constructor(
    message: string,
    code = 'error',
    options: { status?: number; details?: Record<string, unknown>; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? 0;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

/** `fetch` with a hard timeout; network failures become `AppError`s. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  provider: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new AppError(
        `${provider} did not respond within ${Math.round(timeoutMs / 1000)}s.`,
        'timeout',
        { retryable: true },
      );
    }
    throw new AppError(`${provider} could not be reached. Check your connection.`, 'network_error', {
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Bounded retries for transient failures only (network, rate limit, 5xx). */
export async function withRetries<T>(run: () => Promise<T>, attempts = 3, backoffMs = 600): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      if (!(error instanceof AppError) || !error.retryable || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, backoffMs * 2 ** attempt));
    }
  }
  throw last;
}

export async function readJson(response: Response, provider: string): Promise<any> {
  try {
    return await response.json();
  } catch {
    throw new AppError(`${provider} returned a response that is not JSON.`, 'bad_response', {
      status: response.status,
    });
  }
}

/** Best-effort provider message from an error body. */
export async function errorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const error = body?.error;
    const text =
      (typeof error === 'string' ? error : error?.message) ?? body?.message ?? body?.detail ?? body?.code;
    return typeof text === 'string' ? text.slice(0, 300) : '';
  } catch {
    return '';
  }
}
