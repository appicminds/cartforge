import { applyDecorators } from "@nestjs/common";
import { ApiBody } from "@nestjs/swagger";
import { z, type ZodType } from "zod";

/**
 * Documents a request body in OpenAPI from the same Zod schema the endpoint
 * validates with (BE-001: docs generated from actual contracts, not by hand).
 */
export function ApiZodBody(schema: ZodType, description?: string) {
  const json = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
    target: "openapi-3.0",
  }) as Record<string, unknown>;
  return applyDecorators(ApiBody({ schema: json, description, required: true }));
}
