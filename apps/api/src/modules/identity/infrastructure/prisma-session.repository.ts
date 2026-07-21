import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { SessionRecord, SessionRepository } from '../application/ports/identity.repository';

function mapSession(row: {
  id: string;
  userId: string;
  membershipId: string;
  familyId: string;
  refreshTokenHash: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date;
}): SessionRecord {
  return { ...row };
}

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(input: {
    userId: string;
    membershipId: string;
    familyId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
    lastUsedAt: Date;
  }): Promise<SessionRecord> {
    const row = await this.prisma.session.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        membershipId: input.membershipId,
        familyId: input.familyId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        lastUsedAt: input.lastUsedAt,
      },
    });
    return mapSession(row);
  }

  async findByRefreshHash(refreshTokenHash: string): Promise<SessionRecord | null> {
    const row = await this.prisma.session.findFirst({
      where: { refreshTokenHash },
      orderBy: { createdAt: 'desc' },
    });
    return row ? mapSession(row) : null;
  }

  async findActiveByRefreshHash(refreshTokenHash: string): Promise<SessionRecord | null> {
    const row = await this.prisma.session.findFirst({
      where: { refreshTokenHash, status: 'ACTIVE', expiresAt: { gt: new Date() } },
    });
    return row ? mapSession(row) : null;
  }

  async findById(sessionId: string): Promise<SessionRecord | null> {
    const row = await this.prisma.session.findUnique({ where: { id: sessionId } });
    return row ? mapSession(row) : null;
  }

  async rotateSession(
    sessionId: string,
    input: { refreshTokenHash: string; expiresAt: Date; lastUsedAt: Date },
  ): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: input,
    });
  }

  async revokeSession(sessionId: string, reason: string, revokedAt: Date): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { status: 'REVOKED', revokeReason: reason, revokedAt },
    });
  }

  async expireSession(sessionId: string, expiredAt: Date): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { status: 'EXPIRED', revokedAt: expiredAt, revokeReason: 'EXPIRED' },
    });
  }

  async revokeFamily(familyId: string, reason: string, revokedAt: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokeReason: reason, revokedAt },
    });
  }

  async revokeAllUserSessions(
    userId: string,
    reason: string,
    revokedAt: Date,
    exceptSessionId?: string,
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { status: 'REVOKED', revokeReason: reason, revokedAt },
    });
  }

  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
    });
    return rows.map(mapSession);
  }
}
