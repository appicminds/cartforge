import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Trimmed, non-empty text (rejects whitespace-only, PRD §8.4 A). */
export const requiredText = (max: number) =>
  z.string().trim().min(1, "This field is required").max(max, `Must be ${max} characters or fewer`);
