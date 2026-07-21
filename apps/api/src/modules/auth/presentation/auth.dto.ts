import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(3)
  login!: string;

  @IsString()
  @MinLength(1)
  password!: string;

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
