import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PinataService } from './pinata.service';
import { UploadFilesDto } from './dto/upload-files.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';

interface UploadedFileMetadata {
  name: string;
  documentType: string;
  cid: string;
}

@Controller('api/pinata')
export class PinataController {
  constructor(
    private readonly pinataService: PinataService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  // Handle multiple file uploads
  @UseInterceptors(FilesInterceptor('files'))
  async uploadFiles(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body() dto: UploadFilesDto,
  ) {
    // Check if property exists first
    const property = await this.prisma.property.findFirst({
      where: { propertyId: dto.propertyId }, // Search by propertyId string
    });

    if (!property) {
      throw new BadRequestException(`Property with ID ${dto.propertyId} does not exist`);
    }

    // Then use the numeric ID for relations
    const numericPropertyId = property.id;

    const uploadedFiles: UploadedFileMetadata[] = [];
    console.log('##### Received files:', files);
    console.log(
      '##### File details:',
      files?.map((f) => ({
        originalname: f.originalname,
        size: f.size,
        mimetype: f.mimetype,
        path: f.path,
      })),
    );
    console.log('%%%%% DTO:', dto);

    if (!files) {
      throw new BadRequestException('No file uploaded');
    }

    // Upload each file and store its CID
    for (const file of files) {
      const cid = await this.pinataService.uploadFile(file);
      uploadedFiles.push({
        name: file.originalname,
        documentType: file.mimetype,
        cid: cid,
      });

      // Save individual document information to PropertyDocument table
      await this.prisma.propertyDocument.create({
        data: {
          name: file.originalname,
          documentType: file.mimetype,
          documentsCID: cid,
          propertyId: numericPropertyId,
        },
      });
    }

    // Create metadata JSON
    const metadata = {
      propertyId: dto.propertyId,
      documents: uploadedFiles,
      timestamp: new Date().toISOString(),
    };

    const metadataCID = await this.pinataService.uploadMetadata(metadata);

    // Update property with metadata CID
    await this.prisma.property.update({
      where: { id: numericPropertyId },
      data: { documentsCID: metadataCID },
    });

    return {
      success: true,
      metadataCID,
      documents: uploadedFiles,
    };
  }
}
