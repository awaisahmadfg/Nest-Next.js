import { IsOptional, IsString, IsEmail, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Full name must be less than 255 characters' })
  fullName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Please enter a valid email address' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Company name must be less than 100 characters' })
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Phone number must be less than 20 characters' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512, { message: 'Profile image URL must be less than 512 characters' })
  profileImageUrl?: string;
}
