import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ApiEnv } from '@flower/config';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import { hasPermission } from '@flower/permissions';
import { API_ENV } from '../../../infrastructure/infrastructure.module';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { getRequestContext, type AuthContext } from '../../../infrastructure/context/request-context';
import {
  IDENTITY_REPOSITORY,
  SESSION_REPOSITORY,
  type IdentityRepository,
  type SessionRepository,
} from '../../identity/application/ports/identity.repository';
import {
  assertMembershipActive,
  assertPasswordPolicy,
  assertUserCanAuthenticate,
  computeLockUntil,
  normalizeLogin,
} from '../../identity/domain/identity-rules';
import { GENERIC_AUTH_FAILURE, SECURITY_AUDIT_ACTIONS } from '../domain/auth-rules';
import { Argon2PasswordService, hashRefreshToken } from '../../../infrastructure/security/password.service';
import { JwtTokenService } from '../infrastructure/jwt-token.service';
import { InMemoryRateLimiter } from '../infrastructure/rate-limiter.service';

export type LoginResult =
  | {
      status: 'authenticated';
      accessToken: string;
      refreshToken: string;
      user: { id: string; login: string; displayName: string; mustChangePassword: boolean };
      organization: { id: string; name: string };
      permissions: string[];
    }
  | {
      status: 'organization_required';
      organizations: Array<{ id: string; name: string }>;
    };

@Injectable()
export class AuthUseCases {
  constructor(
    @Inject(IDENTITY_REPOSITORY) private readonly identity: IdentityRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    private readonly passwords: Argon2PasswordService,
    private readonly tokens: JwtTokenService,
    private readonly rateLimiter: InMemoryRateLimiter,
  ) {}

  async login(input: {
    login: string;
    password: string;
    organizationId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<LoginResult> {
    const normalizedLogin = normalizeLogin(input.login);
    const ip = input.ipAddress ?? 'unknown';
    if (!this.rateLimiter.consume(this.rateLimiter.loginKey(ip, normalizedLogin), this.rateLimiter.loginLimit())) {
      throw new ForbiddenException({ code: 'RATE_LIMITED', message: 'Too many login attempts' });
    }

    const user = await this.identity.findUserByLogin(normalizedLogin);
    const now = this.clock.now();

    const fail = async (organizationId?: string) => {
      if (user) {
        const attempts = user.failedLoginAttempts + 1;
        const lockedUntil = computeLockUntil(
          attempts,
          this.env.AUTH_LOGIN_MAX_ATTEMPTS,
          this.env.AUTH_LOGIN_LOCKOUT_MINUTES,
          now,
        );
        await this.identity.updateUserLoginState(user.id, {
          failedLoginAttempts: attempts,
          lockedUntil,
        });
        if (organizationId && lockedUntil) {
          await this.securityAudit(organizationId, SECURITY_AUDIT_ACTIONS.USER_LOCKED, user.id);
        }
      }
      if (organizationId) {
        await this.securityAudit(organizationId, SECURITY_AUDIT_ACTIONS.LOGIN_FAILED, user?.id ?? randomUUID());
      }
      throw new UnauthorizedException(GENERIC_AUTH_FAILURE);
    };

    const passwordValid = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyUnknownUser(input.password);

    if (!user || !passwordValid) {
      await fail(input.organizationId ?? undefined);
    }

    try {
      assertUserCanAuthenticate(user!.status, user!.lockedUntil, now);
    } catch {
      await fail(input.organizationId ?? undefined);
    }

    const memberships = await this.identity.listActiveMemberships(user!.id);
    if (memberships.length === 0) {
      await fail(input.organizationId ?? undefined);
    }

    const membership = input.organizationId
      ? memberships.find((m) => m.organizationId === input.organizationId) ?? null
      : memberships.length === 1
        ? memberships[0]!
        : null;

    if (!membership && !input.organizationId && memberships.length > 1) {
      return {
        status: 'organization_required',
        organizations: memberships.map((m) => ({
          id: m.organizationId,
          name: m.organizationName,
        })),
      };
    }

    if (!membership) {
      await fail(input.organizationId ?? undefined);
    }

    assertMembershipActive(membership!.status);
    const profile = await this.identity.loadAuthProfile(membership!.id);
    if (!profile) {
      await fail(membership!.organizationId);
    }

    await this.identity.updateUserLoginState(user!.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: now,
    });

    const sessionBundle = await this.createSession(
      user!.id,
      membership!.id,
      input.ipAddress,
      input.userAgent,
      now,
    );
    await this.securityAudit(
      membership!.organizationId,
      SECURITY_AUDIT_ACTIONS.LOGIN_SUCCEEDED,
      user!.id,
      sessionBundle.sessionId,
    );

    return {
      status: 'authenticated',
      accessToken: this.tokens.signAccessToken({
        sub: user!.id,
        sid: sessionBundle.sessionId,
        mid: membership!.id,
        oid: membership!.organizationId,
      }),
      refreshToken: sessionBundle.refreshToken,
      user: {
        id: user!.id,
        login: user!.login,
        displayName: user!.displayName,
        mustChangePassword: user!.mustChangePassword,
      },
      organization: { id: membership!.organizationId, name: membership!.organizationName },
      permissions: profile!.permissions,
    };
  }

  async refresh(input: {
    refreshToken: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const ip = input.ipAddress ?? 'unknown';
    const hash = hashRefreshToken(this.env.JWT_REFRESH_SECRET, input.refreshToken);
    const session = await this.sessions.findByRefreshHash(hash);
    if (!this.rateLimiter.consume(this.rateLimiter.refreshKey(ip, session?.id), this.rateLimiter.refreshLimit())) {
      throw new ForbiddenException({ code: 'RATE_LIMITED', message: 'Too many refresh attempts' });
    }

    const now = this.clock.now();
    if (!session) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: 'Session is invalid' });
    }

    if (session.status === 'REVOKED') {
      await this.sessions.revokeFamily(session.familyId, 'TOKEN_REUSE', now);
      const profile = await this.identity.loadAuthProfile(session.membershipId);
      if (profile) {
        await this.securityAudit(
          profile.membership.organizationId,
          SECURITY_AUDIT_ACTIONS.TOKEN_REUSE_DETECTED,
          profile.user.id,
          session.id,
        );
      }
      throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: 'Session is invalid' });
    }

    if (session.status !== 'ACTIVE' || session.expiresAt.getTime() <= now.getTime()) {
      if (session.status === 'ACTIVE' && session.expiresAt.getTime() <= now.getTime()) {
        await this.sessions.expireSession(session.id, now);
      }
      throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: 'Session is invalid' });
    }

    const profile = await this.identity.loadAuthProfile(session.membershipId);
    if (!profile) {
      await this.sessions.revokeSession(session.id, 'INVALID_MEMBERSHIP', now);
      throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: 'Session is invalid' });
    }

    assertUserCanAuthenticate(profile.user.status, profile.user.lockedUntil, now);
    assertMembershipActive(profile.membership.status);

    const newRefresh = this.tokens.createRefreshToken();
    const newHash = hashRefreshToken(this.env.JWT_REFRESH_SECRET, newRefresh);
    await this.sessions.rotateSession(session.id, {
      refreshTokenHash: newHash,
      expiresAt: this.tokens.refreshExpiresAt(now),
      lastUsedAt: now,
    });

    await this.securityAudit(
      profile.membership.organizationId,
      SECURITY_AUDIT_ACTIONS.SESSION_REFRESHED,
      profile.user.id,
      session.id,
    );

    return {
      accessToken: this.tokens.signAccessToken({
        sub: profile.user.id,
        sid: session.id,
        mid: profile.membership.id,
        oid: profile.membership.organizationId,
      }),
      refreshToken: newRefresh,
    };
  }

  async logout(sessionId: string): Promise<void> {
    const now = this.clock.now();
    const session = await this.sessions.findById(sessionId);
    if (!session) return;
    await this.sessions.revokeSession(sessionId, 'LOGOUT', now);
    const profile = await this.identity.loadAuthProfile(session.membershipId);
    if (profile) {
      await this.securityAudit(
        profile.membership.organizationId,
        SECURITY_AUDIT_ACTIONS.LOGOUT,
        profile.user.id,
        sessionId,
      );
    }
  }

  async logoutAll(userId: string, exceptSessionId?: string): Promise<void> {
    const now = this.clock.now();
    await this.sessions.revokeAllUserSessions(userId, 'LOGOUT_ALL', now, exceptSessionId);
    const memberships = await this.identity.listActiveMemberships(userId);
    for (const membership of memberships) {
      await this.securityAudit(membership.organizationId, SECURITY_AUDIT_ACTIONS.LOGOUT_ALL, userId);
    }
  }

  async me(auth: AuthContext) {
    const profile = await this.identity.loadAuthProfile(auth.membershipId);
    if (!profile) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session is invalid' });
    }
    return {
      user: {
        id: profile.user.id,
        login: profile.user.login,
        displayName: profile.user.displayName,
        mustChangePassword: profile.user.mustChangePassword,
      },
      organization: {
        id: profile.membership.organizationId,
        name: profile.membership.organizationName,
      },
      permissions: profile.permissions,
      storeScope: auth.storeScope,
      sessionId: auth.sessionId,
    };
  }

  async listSessions(userId: string) {
    const sessions = await this.sessions.listUserSessions(userId);
    return sessions.map((s) => ({
      id: s.id,
      status: s.status,
      expiresAt: s.expiresAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      revokedAt: s.revokedAt?.toISOString() ?? null,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    if (!session || session.userId !== userId) {
      throw new BadRequestException({ code: 'SESSION_NOT_FOUND', message: 'Session not found' });
    }
    const now = this.clock.now();
    await this.sessions.revokeSession(sessionId, 'USER_REVOKED', now);
    const profile = await this.identity.loadAuthProfile(session.membershipId);
    if (profile) {
      await this.securityAudit(
        profile.membership.organizationId,
        SECURITY_AUDIT_ACTIONS.SESSION_REVOKED,
        userId,
        sessionId,
      );
    }
  }

  async changePassword(
    auth: AuthContext,
    input: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    assertPasswordPolicy(input.newPassword);
    const user = await this.identity.findUserById(auth.userId);
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session is invalid' });
    }
    const valid = await this.passwords.verify(user.passwordHash, input.currentPassword);
    if (!valid) {
      throw new BadRequestException({ code: 'INVALID_PASSWORD', message: 'Current password is incorrect' });
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.identity.updateUserPassword(user.id, passwordHash, false);
    await this.securityAudit(
      auth.organizationId,
      SECURITY_AUDIT_ACTIONS.PASSWORD_CHANGED,
      user.id,
      auth.sessionId,
    );
  }

  buildAuthContext(
    profile: NonNullable<Awaited<ReturnType<IdentityRepository['loadAuthProfile']>>>,
    sessionId: string,
  ): AuthContext {
    return {
      userId: profile.user.id,
      membershipId: profile.membership.id,
      organizationId: profile.membership.organizationId,
      sessionId,
      permissions: profile.permissions,
      storeScope: {
        mode: profile.membership.storeAccessMode,
        storeIds: profile.storeIds,
      },
    };
  }

  canViewCost(permissions: readonly string[]): boolean {
    return hasPermission(permissions, ['inventory:view-cost']);
  }

  private async createSession(
    userId: string,
    membershipId: string,
    ipAddress: string | null | undefined,
    userAgent: string | null | undefined,
    now: Date,
  ) {
    const refreshToken = this.tokens.createRefreshToken();
    const familyId = randomUUID();
    const session = await this.sessions.createSession({
      userId,
      membershipId,
      familyId,
      refreshTokenHash: hashRefreshToken(this.env.JWT_REFRESH_SECRET, refreshToken),
      expiresAt: this.tokens.refreshExpiresAt(now),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      lastUsedAt: now,
    });
    return { sessionId: session.id, refreshToken };
  }

  private async securityAudit(
    organizationId: string,
    action: string,
    entityId: string,
    sessionId?: string,
  ): Promise<void> {
    await this.audit.append({
      organizationId,
      storeId: null,
      action,
      entityType: 'SecurityEvent',
      entityId,
      beforeState: null,
      afterState: sessionId ? { sessionId } : null,
      reason: null,
      requestId: getRequestContext()?.requestId ?? 'unknown',
      ipAddress: null,
      userAgent: null,
    });
  }
}
