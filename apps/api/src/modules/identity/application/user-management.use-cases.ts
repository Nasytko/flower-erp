import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { getRequestContext, type AuthContext } from '../../../infrastructure/context/request-context';
import {
  IDENTITY_REPOSITORY,
  SESSION_REPOSITORY,
  type IdentityRepository,
  type MembershipRecord,
  type SessionRepository,
} from './ports/identity.repository';
import {
  assertFloristStoreBinding,
  assertLogin,
  assertPasswordPolicy,
  DomainError,
  normalizeLogin,
} from '../domain/identity-rules';
import { Argon2PasswordService } from '../../../infrastructure/security/password.service';
import {
  STORE_REPOSITORY,
  type StoreRepository,
} from '../../organization/application/ports/repositories';
import { DeliveryUseCases } from '../../delivery/application/delivery.use-cases';

@Injectable()
export class UserManagementUseCases {
  constructor(
    @Inject(IDENTITY_REPOSITORY) private readonly identity: IdentityRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(STORE_REPOSITORY) private readonly stores: StoreRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    private readonly passwords: Argon2PasswordService,
    private readonly deliveries: DeliveryUseCases,
  ) {}

  async listUsers(organizationId: string) {
    const rows = await this.identity.listUsers(organizationId);
    const lastSessions = await this.sessions.findLatestSessionsByUserIds(rows.map((user) => user.id));

    return rows.map(({ passwordHash: _ph, storeAccessMode, stores, roles, ...user }) => ({
      ...user,
      roles,
      storeAccess: {
        mode: storeAccessMode,
        storeIds: stores.map((store) => store.id),
        stores,
      },
      lastSession: lastSessions[user.id] ?? null,
    }));
  }

  async getUser(organizationId: string, userId: string) {
    const membership = await this.identity.findMembership(userId, organizationId);
    if (!membership) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    const user = await this.identity.findUserById(userId);
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    const { passwordHash: _ph, ...safe } = user;
    return { ...safe, membershipId: membership.id, membershipStatus: membership.status };
  }

  async createUser(
    organizationId: string,
    input: {
      login: string;
      password: string;
      displayName: string;
      email?: string | null;
    },
    _actor: AuthContext,
  ) {
    assertLogin(input.login);
    assertPasswordPolicy(input.password);
    const login = normalizeLogin(input.login);
    if (await this.identity.findUserByLogin(login)) {
      throw new ConflictException({ code: 'USER_EXISTS', message: 'Login already exists' });
    }
    const passwordHash = await this.passwords.hash(input.password);
    return this.uow.runInTransaction(async () => {
      const user = await this.identity.createUser({
        login,
        email: input.email ?? null,
        passwordHash,
        displayName: input.displayName.trim(),
        mustChangePassword: true,
      });
      const membership = await this.identity.createMembership({ organizationId, userId: user.id });
      await this.audit.append({
        organizationId,
        storeId: null,
        action: 'USER_CREATED',
        entityType: 'User',
        entityId: user.id,
        beforeState: null,
        afterState: { login: user.login, displayName: user.displayName },
        reason: null,
        requestId: getRequestContext()?.requestId ?? 'unknown',
        ipAddress: null,
        userAgent: null,
      });
      const { passwordHash: _ph, ...safe } = user;
      return { ...safe, membershipId: membership.id };
    });
  }

  async blockUser(organizationId: string, userId: string) {
    await this.ensureMembership(organizationId, userId);
    await this.uow.runInTransaction(async () => {
      await this.identity.updateUserStatus(userId, 'BLOCKED');
      await this.sessions.revokeAllUserSessions(userId, 'USER_BLOCKED', new Date());
      await this.auditUser(organizationId, userId, 'USER_BLOCKED');
    });
  }

  async unblockUser(organizationId: string, userId: string) {
    await this.ensureMembership(organizationId, userId);
    await this.uow.runInTransaction(async () => {
      await this.identity.updateUserStatus(userId, 'ACTIVE');
      await this.auditUser(organizationId, userId, 'USER_UNBLOCKED');
    });
  }

  async archiveUser(organizationId: string, userId: string) {
    await this.ensureMembership(organizationId, userId);
    await this.uow.runInTransaction(async () => {
      await this.identity.updateUserStatus(userId, 'ARCHIVED');
      await this.sessions.revokeAllUserSessions(userId, 'USER_ARCHIVED', new Date());
      await this.auditUser(organizationId, userId, 'USER_ARCHIVED');
    });
  }

  async resetPassword(organizationId: string, userId: string, newPassword: string) {
    assertPasswordPolicy(newPassword);
    await this.ensureMembership(organizationId, userId);
    const passwordHash = await this.passwords.hash(newPassword);
    await this.uow.runInTransaction(async () => {
      await this.identity.updateUserPassword(userId, passwordHash, true);
      await this.sessions.revokeAllUserSessions(userId, 'PASSWORD_RESET', new Date());
      await this.auditUser(organizationId, userId, 'PASSWORD_RESET');
    });
  }

  async assignRoles(organizationId: string, userId: string, roleCodes: string[]) {
    const membership = await this.ensureMembership(organizationId, userId);
    const storeAccess = await this.loadStoreAccess(membership);
    this.assertFloristBinding(roleCodes, storeAccess);

    const currentRoles = await this.identity.listMembershipRoleCodes(membership.id);
    const removingDirector = currentRoles.includes('DIRECTOR') && !roleCodes.includes('DIRECTOR');
    if (removingDirector) {
      const directorCount = await this.identity.countActiveDirectors(organizationId);
      if (directorCount <= 1) {
        throw new BadRequestException({
          code: 'LAST_DIRECTOR',
          message: 'Organization must have at least one active director',
        });
      }
    }

    await this.uow.runInTransaction(async () => {
      await this.identity.ensureSystemRoles(organizationId);
      const roleIds: string[] = [];
      for (const code of roleCodes) {
        const roleId = await this.identity.findRoleIdByCode(organizationId, code);
        if (!roleId) throw new BadRequestException({ code: 'INVALID_ROLE', message: `Unknown role ${code}` });
        roleIds.push(roleId);
      }
      await this.identity.replaceMembershipRoles(membership.id, roleIds);
      await this.auditUser(organizationId, userId, 'ROLES_ASSIGNED', { roleCodes });
    });

    const user = await this.identity.findUserById(userId);
    await this.deliveries.syncCourierMembership({
      organizationId,
      membershipId: membership.id,
      displayName: user?.displayName ?? userId,
      phoneSnapshot: user?.email ?? null,
      isCourier: roleCodes.includes('COURIER'),
    });
  }

  async setStoreAccess(
    organizationId: string,
    userId: string,
    input: { mode: 'ALL_STORES' | 'SELECTED_STORES'; storeIds?: string[] },
  ) {
    const membership = await this.ensureMembership(organizationId, userId);
    const storeIds = input.storeIds ?? [];
    await this.ensureStoresInOrganization(organizationId, storeIds);

    const roleCodes = await this.identity.listMembershipRoleCodes(membership.id);
    const storeAccess = {
      mode: input.mode,
      storeIds: input.mode === 'SELECTED_STORES' ? storeIds : [],
    };
    this.assertFloristBinding(roleCodes, storeAccess);

    await this.uow.runInTransaction(async () => {
      await this.identity.setStoreAccess(membership.id, input.mode, storeIds);
      await this.auditUser(organizationId, userId, 'STORE_ACCESS_CHANGED', input);
    });
  }

  private async ensureMembership(organizationId: string, userId: string) {
    const membership = await this.identity.findMembership(userId, organizationId);
    if (!membership) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    return membership;
  }

  private async loadStoreAccess(membership: MembershipRecord) {
    const storeIds =
      membership.storeAccessMode === 'SELECTED_STORES'
        ? await this.identity.listMembershipStoreIds(membership.id)
        : [];
    return { mode: membership.storeAccessMode, storeIds };
  }

  private assertFloristBinding(
    roleCodes: string[],
    storeAccess: { mode: 'ALL_STORES' | 'SELECTED_STORES'; storeIds: string[] },
  ) {
    try {
      assertFloristStoreBinding(roleCodes, storeAccess);
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  private async ensureStoresInOrganization(organizationId: string, storeIds: string[]) {
    for (const storeId of storeIds) {
      const store = await this.stores.findById(organizationId, storeId);
      if (!store) {
        throw new BadRequestException({
          code: 'INVALID_STORE',
          message: `Store ${storeId} not found in organization`,
        });
      }
    }
  }

  private async auditUser(
    organizationId: string,
    userId: string,
    action: string,
    afterState: Record<string, unknown> | null = null,
  ) {
    await this.audit.append({
      organizationId,
      storeId: null,
      action,
      entityType: 'User',
      entityId: userId,
      beforeState: null,
      afterState,
      reason: null,
      requestId: getRequestContext()?.requestId ?? 'unknown',
      ipAddress: null,
      userAgent: null,
    });
  }
}
