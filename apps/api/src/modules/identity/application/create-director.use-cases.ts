import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../../organization/application/ports/repositories';
import {
  IDENTITY_REPOSITORY,
  SESSION_REPOSITORY,
  type IdentityRepository,
  type SessionRepository,
} from '../application/ports/identity.repository';
import {
  assertLogin,
  assertPasswordPolicy,
  normalizeLogin,
} from '../domain/identity-rules';
import { Argon2PasswordService } from '../../../infrastructure/security/password.service';

export type CreateDirectorInput = {
  organizationId: string;
  login: string;
  password: string;
  displayName: string;
  email?: string | null;
  resetPassword?: boolean;
  attachExistingUser?: boolean;
};

export type CreateDirectorResult = {
  userId: string;
  login: string;
  organizationId: string;
  membershipId: string;
  createdUser: boolean;
  createdMembership: boolean;
  assignedDirector: boolean;
  passwordReset: boolean;
  alreadyDirector: boolean;
};

@Injectable()
export class CreateDirectorUseCases {
  constructor(
    @Inject(IDENTITY_REPOSITORY) private readonly identity: IdentityRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    private readonly passwords: Argon2PasswordService,
  ) {}

  async createDirector(input: CreateDirectorInput): Promise<CreateDirectorResult> {
    assertLogin(input.login);
    assertPasswordPolicy(input.password);
    const login = normalizeLogin(input.login);

    const org = await this.organizations.findById(input.organizationId);
    if (!org) {
      throw new NotFoundException({ code: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found' });
    }

    return this.uow.runInTransaction(async () => {
      const roles = await this.identity.ensureSystemRoles(input.organizationId);
      const directorRoleId = roles.directorRoleId;

      let user = await this.identity.findUserByLogin(login);
      let createdUser = false;
      let passwordReset = false;

      if (user) {
        if (!input.attachExistingUser) {
          throw new ConflictException({
            code: 'USER_EXISTS',
            message: 'User login already exists. Pass attachExistingUser to link this user.',
          });
        }
      } else {
        const passwordHash = await this.passwords.hash(input.password);
        user = await this.identity.createUser({
          login,
          email: input.email ?? null,
          passwordHash,
          displayName: input.displayName.trim(),
          mustChangePassword: true,
        });
        createdUser = true;
        await this.audit.append({
          organizationId: input.organizationId,
          storeId: null,
          action: 'IDENTITY.DIRECTOR_CREATED',
          entityType: 'User',
          entityId: user.id,
          beforeState: null,
          afterState: { login: user.login, displayName: user.displayName },
          reason: 'director-bootstrap',
          requestId: getRequestContext()?.requestId ?? 'director-cli',
          ipAddress: null,
          userAgent: null,
        });
      }

      let membership = await this.identity.findMembership(user.id, input.organizationId);
      let createdMembership = false;
      if (!membership) {
        membership = await this.identity.createMembership({
          organizationId: input.organizationId,
          userId: user.id,
          storeAccessMode: 'ALL_STORES',
        });
        createdMembership = true;
      }

      const roleCodes = await this.identity.listMembershipRoleCodes(membership.id);
      const alreadyDirector = roleCodes.includes('DIRECTOR');
      let assignedDirector = false;

      if (!alreadyDirector) {
        await this.identity.assignRole(membership.id, directorRoleId);
        assignedDirector = true;
        await this.audit.append({
          organizationId: input.organizationId,
          storeId: null,
          action: 'IDENTITY.DIRECTOR_ROLE_ASSIGNED',
          entityType: 'OrganizationMembership',
          entityId: membership.id,
          beforeState: { roles: roleCodes },
          afterState: { roles: [...roleCodes, 'DIRECTOR'] },
          reason: 'director-bootstrap',
          requestId: getRequestContext()?.requestId ?? 'director-cli',
          ipAddress: null,
          userAgent: null,
        });
      }

      if (!createdUser && input.resetPassword) {
        const passwordHash = await this.passwords.hash(input.password);
        await this.identity.updateUserPassword(user.id, passwordHash, true);
        await this.sessions.revokeAllUserSessions(user.id, 'PASSWORD_RESET', new Date());
        passwordReset = true;
        await this.audit.append({
          organizationId: input.organizationId,
          storeId: null,
          action: 'IDENTITY.DIRECTOR_PASSWORD_RESET',
          entityType: 'User',
          entityId: user.id,
          beforeState: null,
          afterState: { login: user.login },
          reason: 'director-cli',
          requestId: getRequestContext()?.requestId ?? 'director-cli',
          ipAddress: null,
          userAgent: null,
        });
      }

      return {
        userId: user.id,
        login: user.login,
        organizationId: input.organizationId,
        membershipId: membership.id,
        createdUser,
        createdMembership,
        assignedDirector,
        passwordReset,
        alreadyDirector,
      };
    });
  }
}
