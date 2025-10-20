import { Role, UserProfileStatus } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { PermissionKey } from 'src/modules/auth/permissions';

@Exclude()
export class UserResponseDto {
  @Expose()
  id: number;

  @Expose()
  email: string;

  @Expose()
  fullName: string | null;

  @Expose()
  roles: Role[];

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;

  @Expose()
  onboardingProgress?: number;

  @Expose()
  isInvited?: boolean;

  @Expose()
  permissions?: PermissionKey[];

  @Expose()
  selectedRole?: Role;

  @Expose()
  lastUsedRole?: Role;

  @Expose()
  @IsOptional()
  profileStatus?: UserProfileStatus;

  @Expose()
  @IsOptional()
  company?: string;

  @Expose()
  @IsOptional()
  profileImageUrl?: string;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
