import {
  Body,
  Controller,
  Post,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Get,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  Put,
  Param,
  ParseIntPipe,
  Query,
  Delete,
  Res,
} from '@nestjs/common';
import express from 'express';
import { CreatePropertyDto } from './dto/create-property.dto';
import { PropertyService } from './property.service';
import { PropertyResponseDto } from './dto/property-response.dto';
import { UpdateFoundationalDataDto } from './dto/update-foundational-data.dto';
import { UpdateOtherInfoDto } from './dto/update-other-info.dto';
import { UpdateUtilitiesAttachmentsDto } from './dto/update-utilities-attachments.dto';
import { UpdateInvitationsDto } from './dto/update-invitations.dto';
import { UpdateOverviewDto } from './dto/update-overview.dto';
import { TiersGuard } from '../auth/guard/tiers.guard';
import { Tiers } from '../auth/decorators/tiers-decorator';
import { Tier } from '../auth/tiers';
import type { AuthenticatedRequest, PropertyAttachment } from 'src/common/types';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { BulkCreatePropertyDto } from './dto/bulk-create-property.dto';
import { GetPropertiesQueryDto } from './dto/get-properties.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from './guard/roles.guard';
import { PropertyEnquiry, PropertyUser, PropertyVisit, Role } from '@prisma/client';
import { Roles } from './decorators/roles.decorator';
import { PaginatedInvitedUsersResponseDto } from './dto/property-invited-users-response.dto';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { PaginatedPropertyUsersResponseDto } from './dto/property-users-response.dto';
import { Public } from '../auth/guard/public.decorator';
import { CreatePropertyScanDto } from './dto/create-property-scan.dto';
import { CreatePropertyEnquiryDto } from './dto/create-property-enquiry.dto';
import { GetMapPropertiesQueryDto } from './dto/get-map-properties.dto';
import { PropertyMapResponseDto } from './dto/map-response.dto';
import { AllPropertiesResponseDto } from './dto/all-properties-response.dto';
import { PropertyAllUsersResponse } from './dto/property-all-users.response.dto';

@Controller('/api')
export class PropertyController {
  constructor(
    private readonly propertyService: PropertyService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1)
  @Post('properties')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(AnyFilesInterceptor())
  async create(
    @Req() req: AuthenticatedRequest,
    @UploadedFiles() documents: Express.Multer.File[],
    @Body('propertyData') propertyData: string,
  ) {
    try {
      const parsed = JSON.parse(propertyData) as CreatePropertyDto;
      const dto = plainToInstance(CreatePropertyDto, parsed);

      await validateOrReject(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      return this.propertyService.createPropertyAndInvite(req.user, dto, documents);
    } catch (err) {
      if (Array.isArray(err)) {
        throw new BadRequestException(err);
      }
      throw err;
    }
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1, Tier.TIER2, Tier.TIER3)
  @Get('properties')
  @HttpCode(HttpStatus.OK)
  async getProperties(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetPropertiesQueryDto,
  ): Promise<{
    properties: AllPropertiesResponseDto[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    const result = await this.propertyService.getProperties(req.user, query);

    return {
      properties: result.properties,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    };
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1, Tier.TIER2, Tier.TIER3)
  @Get('list-properties')
  @HttpCode(HttpStatus.OK)
  async getListProperties(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetPropertiesQueryDto,
  ): Promise<{
    properties: AllPropertiesResponseDto[];
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  }> {
    const result = await this.propertyService.getListProperties(req.user, query);

    return {
      properties: result.properties,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      hasMore: result.hasMore,
    };
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1, Tier.TIER2, Tier.TIER3)
  @Get('map-properties')
  @HttpCode(HttpStatus.OK)
  async getMapProperties(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetMapPropertiesQueryDto,
  ): Promise<{
    properties: PropertyMapResponseDto[];
  }> {
    const result = await this.propertyService.getMapProperties(query);

    return {
      properties: result.properties,
    };
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1, Tier.TIER2, Tier.TIER3)
  @Get('properties/:id')
  @HttpCode(HttpStatus.OK)
  async getPropertyById(
    @Param('id', ParseIntPipe) propertyRecordId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<{
    property: PropertyResponseDto;
  }> {
    const property = await this.propertyService.getPropertyById(propertyRecordId, req.user);

    return {
      property,
    };
  }

  @Public()
  @Get('properties/:id/public')
  @HttpCode(HttpStatus.OK)
  async getPropertyPublicDetails(@Param('id') propertyPublicId: string): Promise<{
    property: PropertyResponseDto;
  }> {
    const property = await this.propertyService.getPropertyPublicDetails(propertyPublicId);

    return {
      property,
    };
  }

  @Public()
  @Post('properties/:id/log-visit')
  @HttpCode(HttpStatus.OK)
  async logPropertyVisit(@Body() body: CreatePropertyScanDto): Promise<{
    propertyVisit: PropertyVisit;
    message: string;
  }> {
    const propertyVisit = await this.propertyService.logPropertyVisit(body);
    return {
      propertyVisit,
      message: 'Visit data logged successfully',
    };
  }

  @Public()
  @Post('properties/:id/enquiry')
  @HttpCode(HttpStatus.OK)
  async createProeprtyEnquiry(
    @Param('id') propertyId: string,
    @Body() propertyEnquiryData: CreatePropertyEnquiryDto,
  ): Promise<{
    enquiry: PropertyEnquiry;
    message: string;
  }> {
    const enquiry = await this.propertyService.createPropertyEnquiry(
      propertyId,
      propertyEnquiryData,
    );
    return {
      enquiry,
      message: 'Enquiry submitted successfully',
    };
  }

  @Get('properties/:id/verify-property-user')
  @HttpCode(HttpStatus.OK)
  async verifyPropetyUser(
    @Param('id') propertyId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{
    data: PropertyUser | null;
  }> {
    const propertyUser = await this.propertyService.verifyCurrentUserIsPropertyUser(
      propertyId,
      req.user,
    );

    return {
      data: propertyUser,
    };
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1)
  @Post('properties/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publishProperty(
    @Param('id', ParseIntPipe) propertyRecordId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<{
    message: string;
  }> {
    return await this.propertyService.publishProperty(propertyRecordId, req.user);
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1)
  @Post('properties/:id/sync-blockchain')
  @HttpCode(HttpStatus.OK)
  async syncPropertyToBlockchain(
    @Param('id', ParseIntPipe) propertyRecordId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<{
    message: string;
  }> {
    return await this.propertyService.syncPropertyToBlockchain(propertyRecordId, req.user);
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1, Tier.TIER2, Tier.TIER3)
  @Get('properties/:id/invited-users')
  @HttpCode(HttpStatus.OK)
  async getInvitedUsers(
    @Param('id', ParseIntPipe) propertyRecordId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{
    data: PaginatedInvitedUsersResponseDto;
    message: string;
  }> {
    const invitedUsers = await this.propertyService.getInvitedUsers(propertyRecordId, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 10,
    });

    return {
      data: invitedUsers,
      message: 'Invited users retrieved successfully',
    };
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1, Tier.TIER2, Tier.TIER3)
  @Get('properties/:id/all-users')
  @HttpCode(HttpStatus.OK)
  async getPropertyInvitedUsersAndActiveUsers(
    @Param('id', ParseIntPipe) propertyRecordId: number,
  ): Promise<{
    data: PropertyAllUsersResponse[];
    message: string;
  }> {
    const users =
      await this.propertyService.getPropertyInvitedUsersAndActiveUsers(propertyRecordId);

    return {
      data: users,
      message: 'Property users retrieved successfully',
    };
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1, Tier.TIER2, Tier.TIER3)
  @Get('properties/:id/users')
  @HttpCode(HttpStatus.OK)
  async getPropertyUsers(
    @Param('id', ParseIntPipe) propertyRecordId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{
    data: PaginatedPropertyUsersResponseDto;
    message: string;
  }> {
    const users = await this.propertyService.getPropertyUsers(propertyRecordId, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 10,
    });

    return {
      data: users,
      message: 'Property users retrieved successfully',
    };
  }

  @Delete('properties/:id/users/:userId')
  @HttpCode(HttpStatus.OK)
  async deletePropertyUser(
    @Param('id', ParseIntPipe) propertyId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.propertyService.deletePropertyUser(propertyId, userId, req.user.id);

    return {
      data: result,
      message: 'Property user deleted successfully',
    };
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1)
  @Post('properties/bulk')
  @HttpCode(HttpStatus.CREATED)
  async bulkCreatePorperties(
    @Req() req: AuthenticatedRequest,
    @Body() properties: BulkCreatePropertyDto,
  ) {
    return await this.propertyService.bulkCreateProperties(req.user, properties);
  }
  // Step-wise update endpoints
  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1)
  @Put('properties/:id/basic-info')
  @HttpCode(HttpStatus.OK)
  async updateFoundationalData(
    @Param('id', ParseIntPipe) propertyRecordId: number,
    @Body() updateData: UpdateFoundationalDataDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.propertyService.updateFoundationalData(propertyRecordId, updateData, req.user);
    return { message: 'Property foundational data updated successfully' };
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1)
  @Put('properties/:id/other-info')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AnyFilesInterceptor())
  async updateOtherInfo(
    @Param('id', ParseIntPipe) propertyRecordId: number,
    @Body('stepData') stepData: string, // JSON string
    @UploadedFiles() documents: Express.Multer.File[],
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    try {
      const parsed = JSON.parse(stepData) as UpdateOtherInfoDto;
      const dto = plainToInstance(UpdateOtherInfoDto, parsed);
      dto.documents = documents;

      await validateOrReject(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      await this.propertyService.updateOtherInfo(propertyRecordId, dto, req.user);
      return { message: 'Property other info updated successfully' };
    } catch (error) {
      console.error('Validation error:', error);
      throw new BadRequestException('Invalid step data format');
    }
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1)
  @Put('properties/:id/utilities-attachments')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AnyFilesInterceptor())
  async updateUtilitiesAttachments(
    @Param('id', ParseIntPipe) propertyRecordId: number,
    @Body('stepData') stepData: string, // JSON string
    @UploadedFiles() documents: Express.Multer.File[],
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    try {
      const parsed = JSON.parse(stepData) as UpdateUtilitiesAttachmentsDto;
      const dto = plainToInstance(UpdateUtilitiesAttachmentsDto, parsed);
      dto.documents = documents;

      await validateOrReject(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      await this.propertyService.updateUtilitiesAttachments(propertyRecordId, dto, req.user);
      return { message: 'Property utilities and attachments updated successfully' };
    } catch (err) {
      if (Array.isArray(err)) {
        throw new BadRequestException(err);
      }
      throw err;
    }
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1)
  @Put('properties/:id/invite-users')
  @HttpCode(HttpStatus.OK)
  async updateInvitations(
    @Param('id', ParseIntPipe) propertyRecordId: number,
    @Body() updateData: UpdateInvitationsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.propertyService.updateInvitations(propertyRecordId, updateData, req.user);
    return { message: 'Property invitations updated successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.PROPERTY_OWNER)
  @Delete('properties/:id/attachments/:attachmentId')
  @HttpCode(HttpStatus.OK)
  async deleteAttachment(
    @Param('id', ParseIntPipe) propertyRecordId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @Query('isPropertyPhoto') isPropertyPhoto: boolean,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.propertyService.deleteAttachment(
      propertyRecordId,
      attachmentId,
      req.user,
      isPropertyPhoto,
    );
    return { message: 'Attachment deleted successfully' };
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1)
  @Put('properties/:id/overview')
  @HttpCode(HttpStatus.OK)
  async updateOverview(
    @Param('id', ParseIntPipe) propertyRecordId: number,
    @Body() updateData: UpdateOverviewDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.propertyService.updateOverview(propertyRecordId, updateData, req.user);
    return { message: 'Property overview updated successfully' };
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1)
  @Post('properties/:id/attachments')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(AnyFilesInterceptor())
  async uploadAttachments(
    @Param('id', ParseIntPipe) propertyRecordId: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: AuthenticatedRequest,
    @Query('isPropertyPhoto') isPropertyPhoto: boolean,
  ): Promise<{ message: string; attachments: PropertyAttachment[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const attachments = await this.propertyService.uploadAttachments(
      propertyRecordId,
      files,
      req.user,
      isPropertyPhoto,
    );
    return {
      message: 'Attachments uploaded successfully',
      attachments,
    };
  }

  @UseGuards(TiersGuard)
  @Tiers(Tier.TIER1, Tier.TIER2)
  @Get('properties/:id/activities')
  async getLogsByProperty(@Param('id', ParseIntPipe) propertyId: number) {
    return this.activityLogService.getLogsByProperty(propertyId);
  }

  @Get('properties/:id/report')
  async getReport(@Param('id') id: string, @Res({ passthrough: false }) res: express.Response) {
    const pdfBuffer: Buffer = await this.propertyService.generatePropertyReport(Number(id));

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename=property-${id}-report.pdf`);
    res.set('Content-Length', pdfBuffer.length.toString());

    res.end(pdfBuffer);
  }
}
