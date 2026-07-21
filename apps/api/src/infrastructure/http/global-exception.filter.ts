import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { createApiErrorBody } from '@flower/contracts';
import { requireRequestId } from '../context/request-context';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestId = requireRequestId();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Unexpected server error';
    let details: unknown[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      } else if (payload && typeof payload === 'object') {
        const body = payload as Record<string, unknown>;
        if (typeof body.code === 'string') {
          code = body.code;
        } else if (typeof body.error === 'string') {
          code = body.error.toUpperCase().replace(/\s+/g, '_');
        } else {
          code = HttpStatus[status] ?? 'HTTP_ERROR';
        }
        if (typeof body.message === 'string') {
          message = body.message;
        } else if (Array.isArray(body.message)) {
          message = 'Validation failed';
          details = body.message;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    response.status(status).json(
      createApiErrorBody({
        code,
        message,
        requestId,
        details,
      }),
    );
  }
}
