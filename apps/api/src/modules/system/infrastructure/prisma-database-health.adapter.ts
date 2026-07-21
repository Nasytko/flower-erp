import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { DatabaseHealthPort } from '../application/ports/database-health.port';

@Injectable()
export class PrismaDatabaseHealthAdapter implements DatabaseHealthPort {
  constructor(private readonly prisma: PrismaService) {}

  isReachable(): Promise<boolean> {
    return this.prisma.isDatabaseReachable();
  }
}
