import { IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(3)
  login!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  /** Six-digit TOTP code from authenticator app (required when 2FA is enabled). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'totpCode must be a 6-digit code' })
  totpCode?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class RevokeSessionParamsDto {
  @IsUUID()
  sessionId!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  newPassword!: string;
}

export class TotpConfirmDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'totpCode must be a 6-digit code' })
  totpCode!: string;
}

export class TotpDisableDto {
  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'totpCode must be a 6-digit code' })
  totpCode!: string;
}
