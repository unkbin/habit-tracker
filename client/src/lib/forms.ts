import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError, errorMessage } from "../api/client";

/**
 * Shows an API error on the form: field errors next to their inputs, anything else as a
 * form-level message (read by `formState.errors.root`).
 */
export function applyApiError<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): void {
  if (error instanceof ApiError && error.fields.length > 0) {
    for (const field of error.fields) {
      setError(field.path as Path<T>, { message: field.message });
    }
    return;
  }
  setError("root", { message: errorMessage(error) });
}
