import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Prisma infrastructure adapter.
 * Domain and application layers must not import PrismaService / @prisma/client.
 * Only module infrastructure adapters may use this service with owned tables.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
