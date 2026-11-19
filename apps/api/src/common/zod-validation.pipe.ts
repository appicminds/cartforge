import { type PipeTransform } from "@nestjs/common";
import type { ZodType, z } from "zod";
import type { FieldError } from "@cartforge/types";
import { AppException } from "./app-exception";

export function zodIssuesToFields(issues: z.core.$ZodIssue[]): FieldError[] {
  return issues.map((i) => ({
    path: i.path.map(String).join("."),
    message: i.message,
    code: i.code,
  }));
}

/** Validates input at the API boundary with a shared Zod schema (BE-002). */
export class ZodValidationPipe<T extends ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) throw AppException.validation(zodIssuesToFields(result.error.issues));
    return result.data;
  }
}
