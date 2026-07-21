import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { COURIER_PERMISSIONS, DIRECTOR_PERMISSIONS, FLORIST_PERMISSIONS, SYSTEM_ROLE_PRESETS } from '@flower/permissions';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  AuthProfile,
  IdentityRepository,
  MembershipRecord,
  UserRecord,
} from '../application/ports/identity.repository';

function mapUser(row: {
  id: string;
  login: string;
  email: string | null;
  passwordHash: string;
  displayName: string;
  status: 'ACTIVE' | 'BLOCKED' | 'ARCHIVED';
  passwordChangedAt: Date;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
}): UserRecord {
  return { ...row };
}

@Injectable()
export class PrismaIdentityRepository implements IdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  countUsers(): Promise<number> {
    return this.prisma.user.count();
  }

  async findUserByLogin(login: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { login } });
    return row ? mapUser(row) : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? mapUser(row) : null;
  }

  async createUser(input: {
    login: string;
    email?: string | null;
    passwordHash: string;
    displayName: string;
    mustChangePassword?: boolean;
  }): Promise<UserRecord> {
    const now = new Date();
    const row = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        login: input.login,
        email: input.email ?? null,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        passwordChangedAt: now,
        mustChangePassword: input.mustChangePassword ?? false,
      },
    });
    return mapUser(row);
  }

  async updateUserLoginState(
    userId: string,
    input: {
      failedLoginAttempts?: number;
      lockedUntil?: Date | null;
      lastLoginAt?: Date | null;
    },
  ): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: input });
  }

  async updateUserPassword(
    userId: string,
    passwordHash: string,
    mustChangePassword: boolean,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword },
    });
  }

  async updateUserStatus(userId: string, status: UserRecord['status']): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { status } });
  }

  async findMembership(userId: string, organizationId: string): Promise<MembershipRecord | null> {
    const row = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { organization: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      status: row.status,
      storeAccessMode: row.storeAccessMode,
      organizationName: row.organization.name,
    };
  }

  async listActiveMemberships(userId: string): Promise<MembershipRecord[]> {
    const rows = await this.prisma.organizationMembership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { organization: true },
    });
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      status: row.status,
      storeAccessMode: row.storeAccessMode,
      organizationName: row.organization.name,
    }));
  }

  async loadAuthProfile(membershipId: string): Promise<AuthProfile | null> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { id: membershipId },
      include: {
        user: true,
        organization: true,
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
        storeAccess: true,
      },
    });
    if (!membership) return null;
    const permissionSet = new Set<string>();
    for (const mr of membership.roles) {
      if (mr.role.status !== 'ACTIVE') continue;
      for (const rp of mr.role.permissions) {
        permissionSet.add(rp.permission.code);
      }
    }
    return {
      user: mapUser(membership.user),
      membership: {
        id: membership.id,
        organizationId: membership.organizationId,
        userId: membership.userId,
        status: membership.status,
        storeAccessMode: membership.storeAccessMode,
        organizationName: membership.organization.name,
      },
      permissions: [...permissionSet],
      storeIds: membership.storeAccess.map((s) => s.storeId),
    };
  }

  async createMembership(input: {
    organizationId: string;
    userId: string;
    storeAccessMode?: 'ALL_STORES' | 'SELECTED_STORES';
  }): Promise<MembershipRecord> {
    const row = await this.prisma.organizationMembership.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        userId: input.userId,
        storeAccessMode: input.storeAccessMode ?? 'ALL_STORES',
      },
      include: { organization: true },
    });
    return {
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      status: row.status,
      storeAccessMode: row.storeAccessMode,
      organizationName: row.organization.name,
    };
  }

  async assignRole(membershipId: string, roleId: string): Promise<void> {
    await this.prisma.membershipRole.upsert({
      where: { membershipId_roleId: { membershipId, roleId } },
      create: { membershipId, roleId },
      update: {},
    });
  }

  async setStoreAccess(
    membershipId: string,
    mode: 'ALL_STORES' | 'SELECTED_STORES',
    storeIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMembership.update({
        where: { id: membershipId },
        data: { storeAccessMode: mode },
      });
      await tx.userStoreAccess.deleteMany({ where: { membershipId } });
      if (mode === 'SELECTED_STORES') {
        for (const storeId of storeIds) {
          await tx.userStoreAccess.create({
            data: { id: randomUUID(), membershipId, storeId },
          });
        }
      }
    });
  }

  async listUsers(organizationId: string) {
    const rows = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: true },
    });
    return rows.map((row) => ({
      ...mapUser(row.user),
      membershipId: row.id,
      membershipStatus: row.status,
    }));
  }

  async ensureSystemRoles(organizationId: string) {
    const director = await this.ensureRole(organizationId, SYSTEM_ROLE_PRESETS.DIRECTOR, DIRECTOR_PERMISSIONS);
    const florist = await this.ensureRole(organizationId, SYSTEM_ROLE_PRESETS.FLORIST, FLORIST_PERMISSIONS);
    const courier = await this.ensureRole(organizationId, SYSTEM_ROLE_PRESETS.COURIER, COURIER_PERMISSIONS);
    return {
      directorRoleId: director.id,
      floristRoleId: florist.id,
      courierRoleId: courier.id,
    };
  }

  async organizationHasOwner(organizationId: string): Promise<boolean> {
    const count = await this.prisma.membershipRole.count({
      where: {
        membership: { organizationId, status: 'ACTIVE' },
        role: { organizationId, code: 'DIRECTOR', status: 'ACTIVE', isSystem: true },
      },
    });
    return count > 0;
  }

  async findRoleIdByCode(organizationId: string, code: string): Promise<string | null> {
    const role = await this.prisma.role.findUnique({
      where: { organizationId_code: { organizationId, code } },
      select: { id: true },
    });
    return role?.id ?? null;
  }

  async listRoles(organizationId: string) {
    const rows = await this.prisma.role.findMany({
      where: { organizationId, status: 'ACTIVE' },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
      orderBy: { code: 'asc' },
    });
    return rows.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      isSystem: role.isSystem,
      status: role.status,
      permissions: role.permissions.map((rp) => rp.permission.code),
    }));
  }

  private async ensureRole(
    organizationId: string,
    preset: { code: string; name: string },
    permissionCodes: readonly string[],
  ) {
    let role = await this.prisma.role.findUnique({
      where: { organizationId_code: { organizationId, code: preset.code } },
    });
    if (!role) {
      role = await this.prisma.role.create({
        data: {
          id: randomUUID(),
          organizationId,
          name: preset.name,
          code: preset.code,
          isSystem: true,
        },
      });
    }
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: [...permissionCodes] } },
    });
    for (const permission of permissions) {
      await this.prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
    return role;
  }
}
