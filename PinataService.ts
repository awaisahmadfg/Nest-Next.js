import { Injectable, InternalServerErrorException } from '@nestjs/common';
import PinataClient from '@pinata/sdk';
import pinataSDK from '@pinata/sdk';
import { Readable } from 'stream';
import { PropertyDocumentsMetadata, UploadedFileMetadata } from './types/pinata.types';
import { Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PinataService {
  private readonly logger = new Logger(PinataService.name);
  private pinata: PinataClient;

  constructor() {
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
      };

      if (fileExtension && mimeTypeMap[fileExtension]) {
        mimeType = mimeTypeMap[fileExtension];
      } else {
        // Throw error for unsupported file types
        throw new InternalServerErrorException(
          `Unsupported file type: ${fileExtension}. Only PDF, DOC, DOCX, JPG, PNG, JSON, TXT, CSV are allowed for property documents.`,
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

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(`Failed to upload file from S3 URL: ${errorMessage}`);
    }
  }
}
