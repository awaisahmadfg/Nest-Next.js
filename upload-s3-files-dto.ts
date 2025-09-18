import { IsString, IsArray, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class S3FileDto {
  @IsString()
  @IsNotEmpty()
  s3Url: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;
}

export class UploadS3FilesDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => S3FileDto)
  files: S3FileDto[];
}
