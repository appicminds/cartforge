import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@cartforge/database";
import { ERROR_CODES, type ApiErrorBody, type FieldError } from "@cartforge/types";
import { AppException } from "./app-exception";
import { zodIssuesToFields } from "./zod-validation.pipe";

const STATUS_CODES: Partial<Record<number, string>> = {
  400: ERROR_CODES.VALIDATION_FAILED,
  401: ERROR_CODES.UNAUTHENTICATED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  422: ERROR_CODES.VALIDATION_FAILED,
  429: ERROR_CODES.RATE_LIMITED,
};

/**
 * Normalizes every error into the API envelope (BE-007). Internal details
 * (stack traces, SQL, Prisma messages) are logged, never returned.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const requestId = String(req.id ?? "");

    const { status, code, message, fields } = this.normalize(exception);
    if (status >= 500) {
      this.logger.error({ err: exception, request_id: requestId }, "Unhandled error");
    }

    const body: ApiErrorBody = {
      error: { code, message, ...(fields?.length ? { fields } : {}) },
      request_id: requestId,
    };
    res.status(status).json(body);
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    message: string;
    fields?: FieldError[];
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        fields: exception.fields,
      };
    }
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "Some fields are invalid.",
        fields: zodIssuesToFields(exception.issues),
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        return {
          status: 409,
          code: ERROR_CODES.CONFLICT,
          message: "A record with these values already exists.",
        };
      }
      if (exception.code === "P2025") {
        return { status: 404, code: ERROR_CODES.NOT_FOUND, message: "Resource not found." };
      }
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // Body-parser errors (malformed JSON, too large) surface as HttpException-like errors.
      const message = status >= 500 ? "Internal server error." : exception.message;
      return {
        status,
        code: STATUS_CODES[status] ?? (status >= 500 ? ERROR_CODES.INTERNAL_ERROR : "HTTP_ERROR"),
        message,
      };
    }
    const maybeStatus = (exception as { status?: unknown; type?: unknown })?.status;
    if (typeof maybeStatus === "number" && maybeStatus >= 400 && maybeStatus < 500) {
      return {
        status: maybeStatus,
        code: STATUS_CODES[maybeStatus] ?? "HTTP_ERROR",
        message: "Malformed request.",
      };
    }
    return { status: 500, code: ERROR_CODES.INTERNAL_ERROR, message: "Internal server error." };
  }
}
