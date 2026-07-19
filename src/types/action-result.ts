/**
 * Normalized result type for Server Actions and service functions.
 * Used throughout the application for consistent error handling.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };
