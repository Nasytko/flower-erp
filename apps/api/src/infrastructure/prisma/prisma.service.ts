import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to database');
    } catch (err) {
      console.error('PRISMA CONNECTION FAILED');
      console.error(err);
      if (err instanceof Error) {
        console.error(err.stack);
      }
      this.logger.error(
        'Prisma $connect failed — check DATABASE_URL host/credentials/network',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      console.error('PRISMA HEALTH CHECK FAILED');
      console.error(err);
      if (err instanceof Error) {
        console.error(err.stack);
      }
      return false;
    }
  }
}
