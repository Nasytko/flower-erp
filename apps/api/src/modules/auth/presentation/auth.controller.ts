import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { ApiEnv } from '@flower/config';
import { API_ENV } from '../../../infrastructure/infrastructure.module';
import { AuthUseCases } from '../application/auth.use-cases';
import { Public } from '../presentation/auth.decorators';
import { CurrentAuthContext } from '../presentation/current-auth-context.decorator';
import type { AuthContext } from '../../../infrastructure/context/request-context';
import { REFRESH_COOKIE_NAME, assertOriginAllowed } from '../domain/auth-rules';
import { LoginDto, ChangePasswordDto, RevokeSessionParamsDto } from './auth.dto';

function setRefreshCookie(res: Response, env: ApiEnv, token: string): void {
  const secure = env.AUTH_COOKIE_SECURE ?? env.NODE_ENV === 'production';
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: env.AUTH_COOKIE_SAME_SITE,
    path: '/api/v1/auth/refresh',
    maxAge: env.JWT_REFRESH_TTL_DAYS * 86_400_000,
  });
}

function clearRefreshCookie(res: Response, env: ApiEnv): void {
  const secure = env.AUTH_COOKIE_SECURE ?? env.NODE_ENV === 'production';
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: env.AUTH_COOKIE_SAME_SITE,
    path: '/api/v1/auth/refresh',
  });
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthUseCases,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login({
      login: body.login,
      password: body.password,
      organizationId: body.organizationId,
      ipAddress: req.ip,
      userAgent: req.header('user-agent') ?? null,
    });
    if (result.status === 'organization_required') {
      return result;
    }
    setRefreshCookie(res, this.env, result.refreshToken);
    return {
      accessToken: result.accessToken,
      user: result.user,
      organization: result.organization,
      permissions: result.permissions,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertOriginAllowed(req.header('origin'), this.env.CORS_ORIGINS);
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Refresh token missing' });
    }
    const result = await this.auth.refresh({
      refreshToken: token,
      ipAddress: req.ip,
      userAgent: req.header('user-agent') ?? null,
    });
    setRefreshCookie(res, this.env, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAuthContext() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(auth.sessionId);
    clearRefreshCookie(res, this.env);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentAuthContext() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutAll(auth.userId, auth.sessionId);
    clearRefreshCookie(res, this.env);
  }

  @Get('me')
  me(@CurrentAuthContext() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @Get('sessions')
  sessions(@CurrentAuthContext() auth: AuthContext) {
    return this.auth.listSessions(auth.userId);
  }

  @Post('sessions/:sessionId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeSession(
    @CurrentAuthContext() auth: AuthContext,
    @Param() params: RevokeSessionParamsDto,
  ) {
    return this.auth.revokeSession(auth.userId, params.sessionId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentAuthContext() auth: AuthContext,
    @Body() body: ChangePasswordDto,
  ) {
    return this.auth.changePassword(auth, body);
  }
}
