import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "./api-client";

/**
 * Maps server validation errors onto form fields (FE-004). Returns the message
 * to show as a form-level error for anything that isn't field-specific.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly Path<T>[],
): string | null {
  if (!(error instanceof ApiError)) return "Something went wrong. Please try again.";
  let unmatched = false;
  for (const f of error.fields) {
    if ((knownFields as readonly string[]).includes(f.path)) {
      setError(f.path as Path<T>, { type: "server", message: f.message });
    } else {
      unmatched = true;
    }
  }
  if (error.fields.length && !unmatched) return null;
  return error.message;
}
