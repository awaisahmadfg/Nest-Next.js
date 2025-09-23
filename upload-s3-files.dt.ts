import { IsString, IsNotEmpty, IsArray, IsUrl } from 'class-validator';

export class UploadS3FilesDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsArray()
  @IsUrl({}, { each: true })
  @IsNotEmpty()
  fileUrls: string[];
}
