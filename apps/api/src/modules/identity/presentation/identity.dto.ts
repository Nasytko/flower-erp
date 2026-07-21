import { IsArray, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class OrganizationParamsDto {
  @IsUUID()
  organizationId!: string;
}

export class OrganizationUserParamsDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  userId!: string;
}

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  login!: string;

  @IsString()
  @MinLength(10)
  password!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsOptional()
  @IsString()
  email?: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(10)
  password!: string;
}

export class AssignRolesDto {
  @IsArray()
  @IsString({ each: true })
  roleCodes!: string[];
}

export class SetStoreAccessDto {
  @IsIn(['ALL_STORES', 'SELECTED_STORES'])
  mode!: 'ALL_STORES' | 'SELECTED_STORES';

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  storeIds?: string[];
}
