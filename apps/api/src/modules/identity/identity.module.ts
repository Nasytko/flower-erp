import { Module } from '@nestjs/common';
import { IDENTITY_REPOSITORY, SESSION_REPOSITORY } from './application/ports/identity.repository';
import { PrismaIdentityRepository } from './infrastructure/prisma-identity.repository';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository';
import { UserManagementUseCases } from './application/user-management.use-cases';
import { BootstrapOwnerUseCases } from './application/bootstrap-owner.use-cases';
import { UserController } from './presentation/user.controller';
import { RoleController } from './presentation/role.controller';
import { OrganizationModule } from '../organization/organization.module';
import { MasterDataModule } from '../master-data/master-data.module';

@Module({
  imports: [OrganizationModule, MasterDataModule],
  controllers: [UserController, RoleController],
  providers: [
    { provide: IDENTITY_REPOSITORY, useClass: PrismaIdentityRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    UserManagementUseCases,
    BootstrapOwnerUseCases,
  ],
  exports: [IDENTITY_REPOSITORY, SESSION_REPOSITORY, UserManagementUseCases, BootstrapOwnerUseCases],
})
export class IdentityModule {}
