import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { WORKSPACE_READ_REPOSITORY } from './application/ports/workspace-read.repository';
import { WorkspaceQueryUseCases } from './application/workspace-query.use-cases';
import { PrismaWorkspaceReadRepository } from './infrastructure/prisma-workspace-read.repository';
import { WorkspaceController } from './presentation/workspace.controller';

/**
 * Analytics module hosts workspace / operations read models (ADR-025).
 * No transactional writes; no separate Operations bounded context.
 */
@Module({
  imports: [OrganizationModule],
  controllers: [WorkspaceController],
  providers: [
    WorkspaceQueryUseCases,
    { provide: WORKSPACE_READ_REPOSITORY, useClass: PrismaWorkspaceReadRepository },
  ],
  exports: [WorkspaceQueryUseCases],
})
export class AnalyticsModule {}
