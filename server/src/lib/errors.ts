export interface FieldError {
  path: string;
  message: string;
}

/** An error that maps directly to an HTTP response. `code` is stable for the frontend to switch on. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldError[],
  ) {
    super(message);
  }
}

export const unauthorized = (message = "Authentication required") =>
  new HttpError(401, "unauthorized", message);

/** Same response shape as a failed Zod parse, for checks that need more than the schema. */
export const validationError = (fields: FieldError[]) =>
  new HttpError(400, "validation_error", "Invalid request", fields);
