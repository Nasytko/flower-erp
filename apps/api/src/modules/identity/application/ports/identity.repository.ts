export const IDENTITY_REPOSITORY = Symbol('IDENTITY_REPOSITORY');
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

export type UserRecord = {
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
};

export type MembershipRecord = {
  id: string;
  organizationId: string;
  userId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  storeAccessMode: 'ALL_STORES' | 'SELECTED_STORES';
  organizationName: string;
};

export type AuthProfile = {
  user: UserRecord;
  membership: MembershipRecord;
  permissions: string[];
  storeIds: string[];
};

export type SessionRecord = {
  id: string;
  userId: string;
  membershipId: string;
  familyId: string;
  refreshTokenHash: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date;
};

export interface IdentityRepository {
  countUsers(): Promise<number>;
  findUserByLogin(login: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  createUser(input: {
    login: string;
    email?: string | null;
    passwordHash: string;
    displayName: string;
    mustChangePassword?: boolean;
  }): Promise<UserRecord>;
  updateUserLoginState(
    userId: string,
    input: {
      failedLoginAttempts?: number;
      lockedUntil?: Date | null;
      lastLoginAt?: Date | null;
    },
  ): Promise<void>;
  updateUserPassword(userId: string, passwordHash: string, mustChangePassword: boolean): Promise<void>;
  updateUserStatus(userId: string, status: UserRecord['status']): Promise<void>;
  findMembership(userId: string, organizationId: string): Promise<MembershipRecord | null>;
  listActiveMemberships(userId: string): Promise<MembershipRecord[]>;
  loadAuthProfile(membershipId: string): Promise<AuthProfile | null>;
  createMembership(input: {
    organizationId: string;
    userId: string;
    storeAccessMode?: 'ALL_STORES' | 'SELECTED_STORES';
  }): Promise<MembershipRecord>;
  assignRole(membershipId: string, roleId: string): Promise<void>;
  setStoreAccess(
    membershipId: string,
    mode: 'ALL_STORES' | 'SELECTED_STORES',
    storeIds: string[],
  ): Promise<void>;
  listUsers(organizationId: string): Promise<Array<UserRecord & { membershipId: string; membershipStatus: MembershipRecord['status'] }>>;
  ensureSystemRoles(organizationId: string): Promise<{
    directorRoleId: string;
    floristRoleId: string;
    courierRoleId: string;
  }>;
  organizationHasOwner(organizationId: string): Promise<boolean>;
  findRoleIdByCode(organizationId: string, code: string): Promise<string | null>;
  listRoles(organizationId: string): Promise<
    Array<{
      id: string;
      code: string;
      name: string;
      isSystem: boolean;
      status: string;
      permissions: string[];
    }>
  >;
}

export interface SessionRepository {
  createSession(input: {
    userId: string;
    membershipId: string;
    familyId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
    lastUsedAt: Date;
  }): Promise<SessionRecord>;
  findByRefreshHash(refreshTokenHash: string): Promise<SessionRecord | null>;
  findActiveByRefreshHash(refreshTokenHash: string): Promise<SessionRecord | null>;
  findById(sessionId: string): Promise<SessionRecord | null>;
  rotateSession(
    sessionId: string,
    input: {
      refreshTokenHash: string;
      expiresAt: Date;
      lastUsedAt: Date;
    },
  ): Promise<void>;
  revokeSession(sessionId: string, reason: string, revokedAt: Date): Promise<void>;
  expireSession(sessionId: string, expiredAt: Date): Promise<void>;
  revokeFamily(familyId: string, reason: string, revokedAt: Date): Promise<void>;
  revokeAllUserSessions(userId: string, reason: string, revokedAt: Date, exceptSessionId?: string): Promise<void>;
  listUserSessions(userId: string): Promise<SessionRecord[]>;
}
