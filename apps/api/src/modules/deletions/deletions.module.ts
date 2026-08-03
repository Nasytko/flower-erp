import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeletionRequestUseCases } from './application/deletion-request.use-cases';
import { EntityHardDeleteService } from './application/entity-hard-delete.service';
import { DeletionsController } from './presentation/deletions.controller';

@Module({
  imports: [AuthModule],
  controllers: [DeletionsController],
  providers: [DeletionRequestUseCases, EntityHardDeleteService],
  exports: [DeletionRequestUseCases],
})
export class DeletionsModule {}
