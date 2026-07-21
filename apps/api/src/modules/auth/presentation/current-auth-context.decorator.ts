import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '../../../infrastructure/context/request-context.js';

export const CurrentAuthContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<{ authContext: AuthContext }>();
    return request.authContext;
  },
);
