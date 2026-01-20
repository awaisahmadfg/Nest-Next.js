import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import PinataClient from '@pinata/sdk';
import pinataSDK from '@pinata/sdk';
import { Readable } from 'stream';
import { PropertyDocumentsMetadata, UploadedFileMetadata } from './types/pinata.types';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PinataService {
  private readonly logger = new Logger(PinataService.name);
  private pinata: PinataClient;

  constructor(private readonly prisma: PrismaService) {
    // Validate environment variables
    if (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_API_KEY) {
      throw new Error('Pinata API keys are not configured');
    }

    try {
      this.pinata = new pinataSDK({
        pinataApiKey: process.env.PINATA_API_KEY,
        pinataSecretApiKey: process.env.PINATA_SECRET_API_KEY,
      });
    } catch (error) {
      this.logger.error('Failed to initialize Pinata client:', error);
      throw new Error('Failed to initialize Pinata client');
    }
  }

  private isPinataFileLimitError(error: unknown): boolean {
    if (!error) return false;

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error);
    const errorString = JSON.stringify(error).toLowerCase();

    const limitErrorPatterns = [
      'maximum number of pins',
      'pin limit',
      'reached the maximum',
      'too many pins',
      'pin quota',
      'exceeded.*pin',
      '429',
    ];

    return limitErrorPatterns.some(
      (pattern) =>
        errorMessage.toLowerCase().includes(pattern.toLowerCase()) ||
        errorString.includes(pattern.toLowerCase()),
    );
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    try {
      const readableStream = Readable.from(file.buffer);

      const options = {
        pinataMetadata: {
          name: file.originalname,
        },
      };

      const result = await this.pinata.pinFileToIPFS(readableStream as any, options);
      return result.IpfsHash;
    } catch (error) {
      this.logger.error('Pinata upload error:', error);

      if (this.isPinataFileLimitError(error)) {
        throw new BadRequestException(
          'Pinata file limit reached. You have reached the maximum number of files (500) allowed on the free Pinata plan. Please upgrade your Pinata plan or remove some files to continue.',
        );
      }

      // Safe error message access
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(`Failed to upload file to IPFS: ${errorMessage}`);
    }
  }

  async uploadMetadata(metadata: PropertyDocumentsMetadata): Promise<string> {
    try {
      const options = {
        pinataMetadata: {
          name: `metadata-${metadata.propertyId}-${Date.now()}`,
        },
      };

      const result = await this.pinata.pinJSONToIPFS(metadata, options);
      return result.IpfsHash;
    } catch (error) {
      this.logger.error('Pinata metadata upload error:', error);

      if (this.isPinataFileLimitError(error)) {
        throw new BadRequestException(
          'Pinata file limit reached. You have reached the maximum number of files (500) allowed on the free Pinata plan. Please upgrade your Pinata plan or remove some files to continue.',
        );
      }

      // Safe error message access
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(`Failed to upload metadata to IPFS: ${errorMessage}`);
    }
  }

  async uploadFileFromS3Url(s3Url: string): Promise<UploadedFileMetadata> {
    try {
      this.logger.log(`Downloading file from S3 URL: ${s3Url}`);

      // Download file from S3 URL
      const response = await axios.get(s3Url, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 seconds timeout
      });

      // Extract filename from URL
      const urlParts = s3Url.split('/');
      let fileName = urlParts[urlParts.length - 1];

      // Remove query parameters if any
      if (fileName.includes('?')) {
        fileName = fileName.split('?')[0];
      }

      // Extract file extension and determine MIME type
      const fileExtension = fileName.split('.').pop()?.toLowerCase();
      let mimeType = 'application/octet-stream';

      // Map property-related file extensions to MIME types
      const mimeTypeMap: { [key: string]: string } = {
        // Property Documents
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

        // Property Images
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',

        // Property Data
        json: 'application/json',
        txt: 'text/plain',
        csv: 'text/csv',

        // Excel Files
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

        // Presentation Files
        ppt: 'application/vnd.ms-powerpoint',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };

      if (fileExtension && mimeTypeMap[fileExtension]) {
        mimeType = mimeTypeMap[fileExtension];
      } else {
        // Throw error for unsupported file types
        throw new InternalServerErrorException(
          `Unsupported file type: ${fileExtension}. Only PDF, DOC, DOCX, JPG, PNG, JSON, TXT, CSV, XLS, XLSX, PPT, PPTX are allowed for property documents.`,
        );
      }

      // Create a buffer from the downloaded data
      const fileBuffer = Buffer.from(response.data as ArrayBuffer);

      // File size validation - prevents oversized files from being processed having 10MB limit (same as FilesInterceptor)
      const maxFileSize = 10 * 1024 * 1024;
      if (fileBuffer.length > maxFileSize) {
        throw new InternalServerErrorException(
          `File ${fileName} exceeds 10MB limit. Size: ${fileBuffer.length} bytes`,
        );
      }

      // Create a mock file object similar to Express.Multer.File
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: fileName,
        encoding: '7bit',
        mimetype: mimeType,
        size: fileBuffer.length,
        buffer: fileBuffer,
        stream: Readable.from(fileBuffer),
        destination: '',
        filename: fileName,
        path: '',
      };

      // Upload to IPFS using existing method
      const cid = await this.uploadFile(mockFile);

      return {
        name: fileName,
        documentType: mimeType,
        cid,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file from S3 URL ${s3Url}:`, error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(`Failed to upload file from S3 URL: ${errorMessage}`);
    }
  }

  /**
   * Upload multiple S3 files to Pinata/IPFS with validation
   * This method contains the logic from PinataController.uploadS3Files
   */
  async uploadS3Files(dto: { propertyId: string; fileUrls: string[] }): Promise<{
    success: boolean;
    message: string;
    metadataCID?: string;
    uploadedFiles?: Array<{ fileName: string; cid: string; size: number }>;
  }> {
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
      ];
      const invalidFiles = uniqueUrls.filter((url) => {
        const urlParts = url.split('/');
        const fileName = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params
        const fileExtension = fileName.split('.').pop()?.toLowerCase();
        return !fileExtension || !allowedExtensions.includes(fileExtension);
      });

      if (invalidFiles.length > 0) {
        throw new BadRequestException(
          `Invalid file types detected. Only PDF, DOC, DOCX, JPG, PNG, JSON, TXT, CSV, XLS, XLSX are allowed for property documents. Invalid files: ${invalidFiles.join(', ')}`,
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
          const result = await this.uploadFileFromS3Url(s3Url);
          return result;
        } catch (error: unknown) {
          if (error instanceof BadRequestException) {
            throw error;
          }

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

      const metadataCID = await this.uploadMetadata(metadata);

      // Persist all document rows and property update in a single transaction
      await this.prisma.$transaction(async (tx) => {
        // Create PropertyDocument records for each uploaded file
        const documentPromises = uploadedFiles.map((file) =>
          tx.propertyDocument.create({
            data: {
              propertyId: numericPropertyId,
              name: file.name,
              documentType: file.documentType,
              documentsCID: file.cid,
            },
          }),
        );

        await Promise.all(documentPromises);

        // Update property with metadata CID
        await tx.property.update({
          where: { id: numericPropertyId },
          data: { documentsCID: metadataCID },
        });
      });

      return {
        success: true,
        message: `Successfully uploaded ${uploadedFiles.length} files to Pinata/IPFS`,
        metadataCID,
        uploadedFiles: uploadedFiles.map((file) => ({
          fileName: file.name,
          cid: file.cid,
          size: 0, // Size not available in UploadedFileMetadata
        })),
      };
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error('Pinata upload failed:', errorMessage);
      throw new InternalServerErrorException(`Pinata upload failed: ${errorMessage}`);
    }
  }
}
