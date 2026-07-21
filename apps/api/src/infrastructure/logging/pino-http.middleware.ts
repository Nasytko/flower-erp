import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import pinoHttp from 'pino-http';
import { REQUEST_ID_HEADER } from '../http/request-id.middleware';
import { getRequestContext } from '../context/request-context';

export function pinoHttpMiddleware(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (req: IncomingMessage) => {
      const header = req.headers[REQUEST_ID_HEADER];
      if (typeof header === 'string' && header.length > 0) {
        return header;
      }
      return getRequestContext()?.requestId ?? 'unknown';
    },
    customProps: () => {
      const ctx = getRequestContext();
      return {
        actorId: ctx?.actorId ?? null,
        organizationId: ctx?.organizationId ?? null,
      };
    },
    serializers: {
      req(req: IncomingMessage & { headers: Record<string, unknown> }) {
        return {
          method: req.method,
          url: req.url,
          // deliberately omit headers that may contain secrets beyond redaction paths
        };
      },
      res(res: ServerResponse) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  });
}
