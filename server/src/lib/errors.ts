/** An error that maps directly to an HTTP response. `code` is stable for the frontend to switch on. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = (message = "Authentication required") =>
  new HttpError(401, "unauthorized", message);
