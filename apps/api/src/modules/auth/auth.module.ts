import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { API_ENV } from '../../infrastructure/infrastructure.module';
import type { ApiEnv } from '@flower/config';
import { AuthUseCases } from './application/auth.use-cases';
import { AuthController } from './presentation/auth.controller';
import { JwtTokenService } from './infrastructure/jwt-token.service';
import { InMemoryRateLimiter } from './infrastructure/rate-limiter.service';
import {
  JwtAuthGuard,
  OrganizationMembershipGuard,
  PermissionsGuard,
  StoreScopeGuard,
} from './guards/auth.guards';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [
    IdentityModule,
    JwtModule.registerAsync({
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => ({
        secret: env.JWT_ACCESS_SECRET,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthUseCases,
    JwtTokenService,
    InMemoryRateLimiter,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: OrganizationMembershipGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: StoreScopeGuard },
  ],
  exports: [AuthUseCases, JwtTokenService],
})
export class AuthModule {}
