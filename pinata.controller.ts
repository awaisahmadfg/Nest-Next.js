import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PinataService } from './pinata.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { UploadedFileMetadata } from './types/pinata.types';
import { UploadS3FilesDto } from './dto/upload-s3-files.dto';

@Controller('api/pinata')
export class PinataController {
  private readonly logger = new Logger(PinataController.name);

  constructor(
    private readonly pinataService: PinataService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  async uploadS3Files(@Body() dto: UploadS3FilesDto) {
    try {
      // Validate input files
      if (!dto.fileUrls || dto.fileUrls.length === 0) {
        throw new BadRequestException('No file URLs provided');
      }

      // URL count limit
      const maxUrlCount = 20;
      if (dto.fileUrls.length > maxUrlCount) {
        throw new BadRequestException(
          `Too many URLs provided. Maximum ${maxUrlCount} URLs allowed, received ${dto.fileUrls.length}`,
        );
      }

      // Remove duplicate URLs to prevent processing the same file multiple times
      const uniqueUrls = [...new Set(dto.fileUrls)];
      if (uniqueUrls.length !== dto.fileUrls.length) {
        const duplicateCount = dto.fileUrls.length - uniqueUrls.length;
        this.logger.warn(`Removed ${duplicateCount} duplicate URLs from request`);
      }

      // Validate file types from URLs before processing
      const allowedExtensions = [
        'pdf',
        'doc',
        'docx',
        'jpg',
        'jpeg',
        'png',
        'json',
        'txt',
        'csv',
        'xls',
        'xlsx',
        'ppt',
        'pptx',
      ];
      const invalidFiles = uniqueUrls.filter((url) => {
        const urlParts = url.split('/');
        const fileName = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params
        const fileExtension = fileName.split('.').pop()?.toLowerCase();
        return !fileExtension || !allowedExtensions.includes(fileExtension);
      });

      if (invalidFiles.length > 0) {
        throw new BadRequestException(
          `Invalid file types detected. Only PDF, DOC, DOCX, JPG, PNG, JSON, TXT, CSV, XLS, XLSX, PPT, PPTX are allowed for property documents. Invalid files: ${invalidFiles.join(', ')}`,
        );
      }

      // Check if property exists and get property owner information
      const property = await this.prisma.property.findUnique({
        where: { propertyId: dto.propertyId },
        include: {
          createdBy: {
            select: {
              fullName: true,
            },
          },
          types: {
            select: {
              type: true,
            },
          },
        },
      });

      if (!property) {
        throw new BadRequestException(`Property with ID ${dto.propertyId} does not exist`);
      }

      const numericPropertyId = property.id;
      const propertyOwnerName = property.createdBy?.fullName || 'Unknown Owner';
      const propertyType =
        property.types && property.types.length > 0
          ? property.types.map((t) => t.type).join(', ')
          : property.secondaryType
            ? String(property.secondaryType)
            : '';
      const propertyName = property.name ? String(property.name) : '';

      // Process unique S3 URLs in parallel with Promise.all
      const uploadPromises = uniqueUrls.map(async (s3Url, index): Promise<UploadedFileMetadata> => {
        try {
          this.logger.log(`Processing S3 URL ${index + 1}/${uniqueUrls.length}: ${s3Url}`);

          const result = await this.pinataService.uploadFileFromS3Url(s3Url);
          return result;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to upload file from S3 URL ${s3Url}: ${message}`);
          throw new InternalServerErrorException(`Failed to upload file from S3 URL: ${s3Url}`);
        }
      });

      // Wait for all file uploads to complete
      const uploadedFiles: UploadedFileMetadata[] = await Promise.all(uploadPromises);

      // Create and upload metadata with property owner information
      const metadata = {
        propertyId: dto.propertyId,
        propertyOwnerName,
        propertyType,
        propertyName,
        documents: uploadedFiles,
        timestamp: new Date().toISOString(),
      };

      const metadataCID = await this.pinataService.uploadMetadata(metadata);

      // Persist all document rows and property update in a single transaction
      await this.prisma.$transaction([
        ...uploadedFiles.map((f) =>
          this.prisma.propertyDocument.create({
            data: {
              name: f.name,
              documentType: f.documentType,
              documentsCID: f.cid,
              propertyId: numericPropertyId,
            },
          }),
        ),
        this.prisma.property.update({
          where: { id: numericPropertyId },
          data: { documentsCID: metadataCID },
        }),
      ]);

      return {
        success: true,
        metadataCID,
        propertyOwnerName,
        propertyName,
        propertyType,
        documents: uploadedFiles,
        message: `S3 files uploaded successfully to IPFS. Processed ${uniqueUrls.length} unique files (${dto.fileUrls.length - uniqueUrls.length} duplicates removed)`,
      };
    } catch (error) {
      this.logger.error('S3 upload failed:', error);

      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to upload S3 files');
    }
  }
}
