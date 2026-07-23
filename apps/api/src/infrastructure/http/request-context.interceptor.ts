import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, Subscription } from 'rxjs';
import {
  requestContextStorage,
  type AuthContext,
  type RequestContextStore,
} from '../context/request-context';

type AuthedRequest = {
  authContext?: AuthContext;
  headers: Record<string, string | string[] | undefined>;
};

/**
 * Re-bind request ALS around the controller Observable so use-cases that read
 * getRequestContext().auth keep permissions after Nest/Express async hops.
 * Guards set `request.authContext`; without this, ALS often still has auth: null
 * and asserts fail with messages like "operations:read required".
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const existing = requestContextStorage.getStore();
    const header = req.headers['x-request-id'];
    const headerId = Array.isArray(header) ? header[0] : header;

    const store: RequestContextStore = {
      requestId:
        existing?.requestId ??
        (typeof headerId === 'string' && headerId.trim().length > 0
          ? headerId.trim()
          : 'unknown'),
      actorId: req.authContext?.userId ?? existing?.actorId ?? null,
      organizationId: req.authContext?.organizationId ?? existing?.organizationId ?? null,
      auth: req.authContext ?? existing?.auth ?? null,
    };

    return new Observable((subscriber) => {
      let inner: Subscription | undefined;
      requestContextStorage.run(store, () => {
        inner = next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
      return () => inner?.unsubscribe();
    });
  }
}
