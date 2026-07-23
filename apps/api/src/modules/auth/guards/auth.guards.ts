import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { hasPermission } from '@flower/permissions';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import { getRequestContext, requestContextStorage } from '../../../infrastructure/context/request-context';
import { AuthUseCases } from '../application/auth.use-cases';
import {
  IDENTITY_REPOSITORY,
  SESSION_REPOSITORY,
  type IdentityRepository,
  type SessionRepository,
} from '../../identity/application/ports/identity.repository';
import { JwtTokenService } from '../infrastructure/jwt-token.service';
import {
  assertMembershipActive,
  assertStoreInScope,
  assertUserCanAuthenticate,
} from '../../identity/domain/identity-rules';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, SKIP_ORG_MATCH_KEY, SKIP_STORE_SCOPE_KEY } from '../presentation/auth.decorators';

type AuthedRequest = Request & {
  authContext?: ReturnType<AuthUseCases['buildAuthContext']>;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: JwtTokenService,
    private readonly auth: AuthUseCases,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(IDENTITY_REPOSITORY) private readonly identity: IdentityRepository,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }

    let payload;
    try {
      payload = this.tokens.verifyAccessToken(header.slice(7));
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid access token' });
    }

    const session = await this.sessions.findById(payload.sid);
    const now = this.clock.now();
    if (!session || session.status !== 'ACTIVE' || session.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session expired' });
    }

    const profile = await this.identity.loadAuthProfile(payload.mid);
    if (!profile) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Membership not found' });
    }

    assertUserCanAuthenticate(profile.user.status, profile.user.lockedUntil, now);
    assertMembershipActive(profile.membership.status);

    if (profile.membership.organizationId !== payload.oid || profile.user.id !== payload.sub) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Token context mismatch' });
    }

    const authContext = this.auth.buildAuthContext(profile, session.id);
    request.authContext = authContext;

    // Always bind auth into ALS. Nest may run guards outside the middleware `run()`
    // frame; skipping enterWith leaves getRequestContext().auth null and use-cases
    // incorrectly deny with "operations:read required" after PermissionsGuard passed.
    const existing = getRequestContext();
    requestContextStorage.enterWith({
      requestId: existing?.requestId ?? 'unknown',
      actorId: authContext.userId,
      organizationId: authContext.organizationId,
      auth: authContext,
    });

    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const auth = request.authContext;
    if (!auth) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    if (!hasPermission(auth.permissions, required)) {
      throw new ForbiddenException({ code: 'ACCESS_DENIED', message: 'Insufficient permissions' });
    }
    return true;
  }
}

@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ORG_MATCH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest & { params: Record<string, string> }>();
    const auth = request.authContext;
    if (!auth) return true;

    const organizationId = request.params.organizationId;
    if (organizationId && organizationId !== auth.organizationId) {
      throw new ForbiddenException({ code: 'TENANT_MISMATCH', message: 'Organization access denied' });
    }
    return true;
  }
}

@Injectable()
export class StoreScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_STORE_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest & { params: Record<string, string> }>();
    const auth = request.authContext;
    if (!auth) return true;

    const storeId = request.params.storeId;
    if (!storeId) return true;

    try {
      assertStoreInScope(auth.storeScope, storeId);
    } catch {
      throw new ForbiddenException({ code: 'STORE_ACCESS_DENIED', message: 'Store access denied' });
    }
    return true;
  }
}
