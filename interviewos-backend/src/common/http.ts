import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
  createParamDecorator,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ThrottlerException } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { map, Observable } from "rxjs";
import type { AuthUser } from "./auth-user";

/** Controllers may return { data, meta } to control the envelope; anything else becomes `data`. */
export class Paged<T> {
  constructor(public readonly data: T[], public readonly meta: { page: number; limit: number; total: number; totalPages: number; [extra: string]: unknown }) {}
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { id?: string }>();
    return next.handle().pipe(
      map((body) => {
        if (body instanceof Paged) return { success: true, data: body.data, meta: { ...body.meta, requestId: req.id } };
        return { success: true, data: body ?? null, meta: { requestId: req.id } };
      }),
    );
  }
}

/** Converts every error into the standard error envelope. Never leaks stack traces or SQL. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request & { id?: string }>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "An unexpected error occurred.";
    let details: unknown;

    if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = "RATE_LIMITED";
      message = "Too many requests. Please slow down.";
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as string | { code?: string; message?: string | string[]; details?: unknown };
      if (typeof body === "object" && body.code) {
        code = body.code;
        message = String(body.message);
        details = body.details;
      } else if (status === HttpStatus.BAD_REQUEST) {
        code = "VALIDATION_FAILED";
        message = "The request is invalid.";
        details = typeof body === "object" ? body.message : body;
      } else if (status === HttpStatus.NOT_FOUND) {
        code = "RESOURCE_NOT_FOUND";
        message = "The requested resource was not found.";
      } else if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        code = "VALIDATION_FAILED";
        message = "The request body is too large.";
      } else {
        message = typeof body === "string" ? body : String(body.message ?? message);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        status = HttpStatus.CONFLICT;
        code = "CONFLICT";
        message = "A record with these details already exists.";
      } else if (exception.code === "P2025") {
        status = HttpStatus.NOT_FOUND;
        code = "RESOURCE_NOT_FOUND";
        message = "The requested resource was not found.";
      }
    }

    if (status >= 500) this.logger.error({ err: exception, requestId: req.id }, "Unhandled error");
    res.status(status).json({ success: false, error: { code, message, ...(details !== undefined ? { details } : {}) }, meta: { requestId: req.id } });
  }
}

export interface RequestContext {
  user: AuthUser;
  requestId?: string;
}

/** Injects { user, requestId } — the authenticated user is attached by FirebaseAuthGuard. */
export const Ctx = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestContext => {
  const req = ctx.switchToHttp().getRequest<Request & { id?: string; user: AuthUser }>();
  return { user: req.user, requestId: req.id ? String(req.id) : undefined };
});
