import { HttpException, HttpStatus } from "@nestjs/common";

/** Stable machine-readable error codes returned in { success: false, error: { code, message } }. */
export type ErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "AUTH_NOT_CONFIGURED"
  | "FORBIDDEN"
  | "ACCOUNT_DISABLED"
  | "SIGN_IN_METHOD_NOT_ALLOWED"
  | "RESOURCE_NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATUS_TRANSITION"
  | "INTERVIEW_NOT_STARTED"
  | "INTERVIEW_NOT_ACTIVE"
  | "INTERVIEW_EXPIRED"
  | "INTERVIEW_INCOMPLETE"
  | "ANSWER_ALREADY_CONFIRMED"
  | "QUESTION_NOT_IN_SESSION"
  | "QUESTION_SET_NOT_PUBLISHED"
  | "FEATURE_DISABLED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class AppError extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const notFound = (what: string) => new AppError("RESOURCE_NOT_FOUND", `${what} was not found.`, HttpStatus.NOT_FOUND);
export const forbidden = (message = "You do not have permission to perform this action.") => new AppError("FORBIDDEN", message, HttpStatus.FORBIDDEN);
export const conflict = (code: ErrorCode, message: string) => new AppError(code, message, HttpStatus.CONFLICT);
export const unprocessable = (code: ErrorCode, message: string, details?: unknown) => new AppError(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
