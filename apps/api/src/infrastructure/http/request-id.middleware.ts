import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requestContextStorage } from '../context/request-context';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Bind request ALS for the whole Express chain via enterWith.
 * Avoid `run(() => next())` — Nest async guards often resume outside that run()
 * frame, so later use-cases see an empty store (auth: null).
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.trim().length > 0 ? incoming.trim() : uuidv4();

  res.setHeader(REQUEST_ID_HEADER, requestId);

  requestContextStorage.enterWith({
    requestId,
    actorId: null,
    organizationId: null,
    auth: null,
  });

  next();
}
