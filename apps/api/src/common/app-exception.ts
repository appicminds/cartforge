import { HttpException, HttpStatus } from "@nestjs/common";
import { ERROR_CODES, type ErrorCode, type FieldError } from "@cartforge/types";

/** Domain exception carrying a stable error code (BE-007). */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode | string,
    message: string,
    status: HttpStatus,
    public readonly fields?: FieldError[],
  ) {
    super({ code, message, fields }, status);
  }

  static validation(fields: FieldError[], message = "Some fields are invalid.") {
    return new AppException(
      ERROR_CODES.VALIDATION_FAILED,
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
      fields,
    );
  }
  static unauthenticated(message = "Authentication required.") {
    return new AppException(ERROR_CODES.UNAUTHENTICATED, message, HttpStatus.UNAUTHORIZED);
  }
  static forbidden(message = "You don't have permission to perform this action.") {
    return new AppException(ERROR_CODES.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }
  static notFound(resource = "Resource") {
    return new AppException(ERROR_CODES.NOT_FOUND, `${resource} not found.`, HttpStatus.NOT_FOUND);
  }
  static conflict(message: string, fields?: FieldError[], code: string = ERROR_CODES.CONFLICT) {
    return new AppException(code, message, HttpStatus.CONFLICT, fields);
  }
}
