/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { PropertyResponseDto } from './dto/property-response.dto';
import {
  PropertiesType,
  Role,
  RoleStatus,
  Utilities,
  Prisma,
  PropertyStatus,
  PropertyUser,
  PropertyVisit,
  PropertyEnquiry,
  DealStructure,
} from '@prisma/client';
import { UpdateFoundationalDataDto } from './dto/update-foundational-data.dto';
import { UpdateOtherInfoDto } from './dto/update-other-info.dto';
import { UpdateUtilitiesAttachmentsDto } from './dto/update-utilities-attachments.dto';
import { UpdateInvitationsDto } from './dto/update-invitations.dto';
import { UpdateOverviewDto } from './dto/update-overview.dto';
import { InvitationsService } from '../invitations/invitations.service';
import type { Attachment, PropertyAttachment } from 'src/common/types';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { S3Service } from '../file-upload/s3.service';
import { BulkCreatePropertyDto } from './dto/bulk-create-property.dto';
import { generatePropertyId } from 'src/common/helpers';
import { GetPropertiesQueryDto } from './dto/get-properties.dto';
import {
  PaginatedInvitedUsersResponseDto,
  PropertyInvitedUsersResponse,
} from './dto/property-invited-users-response.dto';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ActivityActions, ActivityEntityTypes } from '../activity-log/types';
import {
  PaginatedPropertyUsersResponseDto,
  PropertyUserResponseDto,
} from './dto/property-users-response.dto';
import { LambdaService } from '../lambda/lambda.service';
import { EmailService } from '../email/email.service';
import { EmailType } from '../email/types/email.types';
import {
  BLOCKCHAIN,
  PropertyEnquiryApplyTypeLabels,
  PropertyEnquiryReasonTypeLables,
  PropertyEnquiryTypeLabels,
  PropertyTypeLabels,
  PropertyUSerInviteStatusLabels,
  UserRoleLabels,
} from 'src/common/constants';
import { BlockchainService } from '../blockchain/blockchain.service';
import { CreatePropertyScanDto } from './dto/create-property-scan.dto';
import { CreatePropertyEnquiryDto } from './dto/create-property-enquiry.dto';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '@nestjs/config';
import { GetMapPropertiesQueryDto } from './dto/get-map-properties.dto';
import { PropertyMapResponseDto } from './dto/map-response.dto';
import { AllPropertiesResponseDto } from './dto/all-properties-response.dto';
import dayjs from 'dayjs';
import { ActivityEntryForReport, ActivityGroup, ActivityRow } from './types/property-type.enum';
import { PropertyReportTemplates } from './propertyReportTemplates';
import { getBrowser } from './puppeteer.manager';
import { NotificationService } from '../notifications/notification.service';
import { NotificationQueueService } from '../notifications/notification-queue.service';
import { Tier } from '../auth/tiers';
import { getRolesForTier } from '../auth/utils/tier.utils';
import { PropertyAllUsersResponse } from './dto/property-all-users.response.dto';

function isValidUtility(utility: string): utility is Utilities {
  return ['Power', 'Water', 'Gas', 'Internet', 'Parking', 'Safety'].includes(utility);
}

@Injectable()
export class PropertyService {
  private readonly logger = new Logger(PropertyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invitationsService: InvitationsService,
    private readonly s3Service: S3Service,
    private readonly activityService: ActivityLogService,
    private readonly lambdaService: LambdaService,
    private readonly emailService: EmailService,
    private readonly blockchainService: BlockchainService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly notificationQueueService: NotificationQueueService,
  ) {}

  async createPropertyAndInvite(
    currentUser: UserResponseDto,
    createPropertyDto: CreatePropertyDto,
    documents?: Express.Multer.File[],
  ): Promise<{ message: string }> {
    const {
      propertyTypes,
      propertyName,
      addressData,
      market,
      subMarket,
      secondaryType,
      grossBuildingArea,
      landSize,
      yearBuilt,
      invites,
      dealStructure,
      ownerName,
      ownerPhoneNumber,
      ownerEmail,
      ownerCompany,
    } = createPropertyDto;

    const propertyId = generatePropertyId(
      addressData.country ?? 'US',
      addressData.state ?? 'MA',
      addressData.city ?? 'CAMB',
      addressData.zipCode ?? '02139',
    );

    // Upload documents
    let attachmentsData: Attachment[] = [];

    if (documents && documents.length > 0) {
      attachmentsData = await Promise.all(
        documents.map(async (file: Express.Multer.File): Promise<Attachment> => {
          const s3Url: string = await this.s3Service.uploadFile(file, 'property');
          return {
            fileName: file.originalname,
            fileSize: file.size,
            fileType: file.mimetype,
            filePath: s3Url,
          };
        }),
      );
    }

    const propertyTypesData: Prisma.PropertyTypeOnPropertyCreateManyPropertyInput[] =
      propertyTypes.map((type) => ({
        type,
      }));

    // Create property
    const property = await this.prisma.property.create({
      data: {
        propertyId,
        name: propertyName,
        market,
        subMarket,
        secondaryType,
        yearBuilt,
        createdById: currentUser.id,
        attachments: { create: attachmentsData },
        completenessScore: 40,
        types: {
          createMany: { data: propertyTypesData },
        },
        propertyAddress: {
          create: {
            formatedAddress: addressData.address,
            city: addressData.city,
            state: addressData.state,
            zipCode: addressData.zipCode,
            country: addressData.country,
            latitude: addressData.latitude,
            longitude: addressData.longitude,
          },
        },
        otherInfo: {
          create: {
            landSize,
            grossBuildingArea,
            dealStructure,
            imageIds: [],
            attachmentIds: [],
          },
        },
        ownerInfo: {
          create: {
            name: ownerName,
            phoneNumber: ownerPhoneNumber,
            email: ownerEmail,
            company: ownerCompany,
          },
        },
      },
      include: { types: true, attachments: true, ownerInfo: true, propertyAddress: true },
    });

    // After property is created, update PropertyOtherInfo with attachment IDs
    if (attachmentsData.length > 0 && property.attachments) {
      const createdAttachments = property.attachments;
      const attachmentIds: number[] = createdAttachments.map((attachment) => attachment.id);

      if (attachmentIds.length > 0) {
        await this.prisma.propertyOtherInfo.update({
          where: { propertyRecordId: property.id },
          data: {
            attachmentIds: attachmentIds,
          },
        });
      }
    }

    // Send invites
    if (Array.isArray(invites) && invites.length > 0) {
      this.logger.log(`✅ Invites found, sending ${invites.length} invitations`);
      const tasks = invites.map((inv) => {
        this.logger.log(
          `Sending invitation to ${inv.email} with roles ${JSON.stringify(inv.roles)}`,
        );
        return this.invitationsService.inviteToProperty({
          invitedById: currentUser.id,
          email: inv.email,
          roles: inv.roles,
          propertyId: property.propertyId,
        });
      });
      await Promise.allSettled(tasks);
    }

    await this.activityService.logActivity({
      action: ActivityActions.PROPERTY_CREATED,
      entityId: property.id,
      entityType: ActivityEntityTypes.PROPERTY,
      description: 'Create Property',
      metadata: {
        propertyId: property.id,
        name: property.name,
        market: property.market,
        createdBy: currentUser.id,
        createdAt: property.createdAt,
        location: property.propertyAddress?.formatedAddress ?? null,
        attachments: attachmentsData.map((attachment) => ({
          link: attachment.filePath,
          name: attachment.fileName,
        })),
        totalInvited: invites?.length,
        invitedUsers: invites?.map((inv) => ({
          email: inv.email,
          roles: inv.roles,
        })),
      },
    });

    let message = 'Property created successfully';
    if (invites && invites.length > 0) {
      message += ' and invitations sent';
    }

    return {
      message,
    };
  }

  async publishProperty(
    propertyRecordId: number,
    currentUser: UserResponseDto,
  ): Promise<{ message: string }> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyRecordId },
      include: {
        attachments: true,
        types: {
          select: {
            type: true,
          },
        },
        otherInfo: {
          select: {
            attachmentIds: true,
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    // Include ALL attachments that are in attachmentIds (all files in attachmentIds go to metadata)
    // This includes both documents and any images that are in attachmentIds
    const attachmentIds = property.otherInfo?.attachmentIds || [];
    const attachmentsForMetadata = property.attachments.filter((attachment) =>
      attachmentIds.includes(attachment.id),
    );

    if (!attachmentsForMetadata || attachmentsForMetadata.length === 0) {
      throw new BadRequestException(
        'Property must have at least one attachment in attachmentIds to publish',
      );
    }

    // Get user details for email
    const userDetails = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { email: true, fullName: true },
    });

    if (!userDetails?.email) {
      throw new BadRequestException('User email not found');
    }

    // Prevent duplicate publishing: Check if property already has tokenId and is APPROVED
    if (property.tokenId && property.status === PropertyStatus.APPROVED) {
      this.logger.warn(
        `Property ${property.propertyId} already has tokenId ${property.tokenId} and is APPROVED. Skipping duplicate publish.`,
      );
      throw new BadRequestException(
        `Property already published to blockchain with tokenId ${property.tokenId}. Cannot publish again.`,
      );
    }

    // Determine action: register (no tokenId) or update (has tokenId)
    const action = property.tokenId ? 'update' : 'register';
    // Include all attachments from attachmentIds in fileUrls
    const fileUrls = attachmentsForMetadata.map((attachment) => attachment.filePath);

    // Get property types as comma-separated string
    const propertyType =
      property.types && property.types.length > 0
        ? property.types.map((t) => t.type).join(', ')
        : property.secondaryType
          ? String(property.secondaryType)
          : '';

    this.logger.log(
      `Processing blockchain ${action} job for property ${property.propertyId} with ${fileUrls.length} attachments from attachmentIds`,
    );

    if (!propertyType) {
      this.logger.warn(
        `Property ${property.propertyId} has no property types set. Metadata will have empty propertyType.`,
      );
    }

    try {
      const balanceEth = await this.blockchainService.getWalletBalanceEth();
      const balanceWei = parseFloat(balanceEth);

      if (balanceWei === 0) {
        this.logger.warn(`Wallet balance is zero: ${balanceEth} POL`);
        const errorMessage = `Insufficient balance in wallet. Current balance: ${balanceEth} POL. Please add funds to complete the transaction.`;

        if (property) {
          await this.activityService.logActivity({
            action: ActivityActions.PROPERTY_PUBLISH_BALANCE_ERROR,
            entityType: ActivityEntityTypes.PROPERTY,
            entityId: property.id,
            description: errorMessage,
            metadata: {
              propertyId: property.propertyId,
              action: action,
              balance: balanceEth,
              errorType: 'zero_balance',
            },
          });
        }

        throw new BadRequestException(errorMessage);
      }

      // Only estimate gas for register action (not for update in publish)
      if (action === 'register' && !property.tokenId) {
        const dummyCID = 'QmYjtig7VJQ6XsnUjqqJvj7QaMcCAwtrgNdahSiFofrE7o';
        this.logger.log(`Estimating gas cost for register with dummy CID: ${dummyCID}`);

        const estimate = await this.blockchainService.estimateRegisterLandCost(dummyCID);
        const estimatedCostWei = estimate.totalCostWei;
        this.logger.log(
          `Estimated gas cost for register: ${estimate.totalCostEth} POL (${estimatedCostWei.toString()} wei)`,
        );

        // Compare balance with estimated cost
        const balanceWeiBigInt = BigInt(Math.floor(balanceWei * 1e18)); // Convert POL to wei
        if (balanceWeiBigInt < estimatedCostWei) {
          const estimatedCostEth = (Number(estimatedCostWei) / 1e18).toFixed(6);
          this.logger.warn(
            `Insufficient balance: ${balanceEth} POL < estimated cost: ${estimatedCostEth} POL`,
          );
          const errorMessage = `Insufficient balance in wallet. Current balance: ${balanceEth} POL. Estimated transaction cost: ${estimatedCostEth} POL. Please add funds to complete the transaction.`;

          if (property) {
            await this.activityService.logActivity({
              action: ActivityActions.PROPERTY_PUBLISH_BALANCE_ERROR,
              entityType: ActivityEntityTypes.PROPERTY,
              entityId: property.id,
              description: errorMessage,
              metadata: {
                propertyId: property.propertyId,
                action: action,
                balance: balanceEth,
                estimatedCost: estimatedCostEth,
                errorType: 'insufficient_balance',
              },
            });
          }

          throw new BadRequestException(errorMessage);
        }
      }

      this.logger.log(
        `Wallet balance check passed: ${balanceEth} POL (sufficient for transaction)`,
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to check wallet balance: ${errorMessage}`);
      throw new BadRequestException(
        `Failed to verify wallet balance. Please try again later. Error: ${errorMessage}`,
      );
    }

    this.processBlockchainJob({
      action,
      propertyId: property.propertyId,
      propertyName: property.name,
      propertyType,
      fileUrls,
      userId: currentUser.id,
      userEmail: userDetails.email,
      userFullName: userDetails.fullName,
      tokenId: property.tokenId || undefined,
    }).catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Background blockchain ${action} job failed for property ${property.propertyId}: ${errorMessage}`,
      );
    });

    return {
      message: `Property ${action === 'register' ? 'registration' : 'update'} job started successfully`,
    };
  }

  async getProperties(
    user: UserResponseDto,
    query: GetPropertiesQueryDto,
  ): Promise<{
    properties: AllPropertiesResponseDto[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    const { id: userId, selectedRole } = user;
    const {
      cursor,
      limit = 9,
      status = [],
      types = [],
      market,
      subMarket,
      dateFrom,
      dateTo,
    } = query;

    const validCursor =
      cursor && cursor.trim() && !isNaN(parseInt(cursor, 10)) ? parseInt(cursor, 10) : undefined;

    // 🧱 Build where clause dynamically
    const whereClause: any = {};

    if (status.length > 0) {
      whereClause.status = { in: status };
    }

    if (types.length > 0) {
      const validTypes = types
        .map((t) => t.toUpperCase())
        .filter((t): t is keyof typeof PropertiesType => t in PropertiesType)
        .map((t) => PropertiesType[t]);

      if (validTypes.length > 0) {
        whereClause.types = {
          some: {
            type: { in: validTypes },
          },
        };
      }
    }

    if (market) {
      whereClause.market = { contains: market, mode: 'insensitive' };
    }

    if (subMarket) {
      whereClause.subMarket = { contains: subMarket, mode: 'insensitive' };
    }

    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) {
        whereClause.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        whereClause.createdAt.lte = new Date(dateTo);
      }
    }

    if (validCursor) {
      whereClause.id = { lt: validCursor };
    }

    // 🔒 Restrict non-admin users
    if (selectedRole !== Role.SUPER_ADMIN && selectedRole !== Role.ADMIN) {
      whereClause.propertyUsers = {
        some: {
          userId,
          userRole: { role: { equals: selectedRole } },
        },
      };
    }

    // Query
    const properties = await this.prisma.property.findMany({
      where: whereClause,
      select: {
        id: true,
        propertyId: true,
        name: true,
        status: true,
        updatedAt: true,
        propertyAddress: { select: { formatedAddress: true } },
        otherInfo: { select: { dealStructure: true, lastSale_or_rentPrice: true, imageIds: true } },
        attachments: { select: { id: true, filePath: true } },
        types: { select: { type: true } },
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });

    const hasMore = properties.length > limit;
    const resultProperties = hasMore ? properties.slice(0, limit) : properties;

    const nextCursor =
      resultProperties.length > 0
        ? resultProperties[resultProperties.length - 1].id.toString()
        : undefined;

    // 🧮 Transform and flatten response structure
    const transformedProperties = resultProperties.map((property) => {
      // Filter attachments by imageIds from otherInfo
      const imageIds = property.otherInfo?.imageIds || [];
      const filteredAttachments = property.attachments.filter((attachment) =>
        imageIds.includes(attachment.id),
      );

      return {
        id: property.id,
        propertyId: property.propertyId,
        name: property.name,
        address: property.propertyAddress?.formatedAddress ?? '',
        status: property.status,
        updatedAt: property.updatedAt,
        type: property.types.map((t) => t.type),
        dealStructure: property.otherInfo?.dealStructure ?? null,
        lastSale_or_rentPrice: property.otherInfo?.lastSale_or_rentPrice ?? '',
        attachments: filteredAttachments.map((attachment) => attachment.filePath),
      };
    });

    return {
      properties: plainToInstance(AllPropertiesResponseDto, transformedProperties, {
        excludeExtraneousValues: true,
      }),
      hasMore,
      nextCursor: hasMore ? nextCursor : undefined,
    };
  }

  async getListProperties(
    user: UserResponseDto,
    query: GetPropertiesQueryDto,
  ): Promise<{
    properties: AllPropertiesResponseDto[];
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  }> {
    const { id: userId, selectedRole } = user;
    const {
      offset = 0,
      limit = 9,
      status = [],
      types = [],
      market,
      subMarket,
      dateFrom,
      dateTo,
    } = query;

    // Ensure offset and limit are valid numbers
    const validOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
    const validLimit = Number.isFinite(limit) && limit > 0 ? limit : 9;

    // 🧱 Build where clause dynamically
    const whereClause: any = {};

    if (status.length > 0) {
      whereClause.status = { in: status };
    }

    if (types.length > 0) {
      const validTypes = types
        .map((t) => t.toUpperCase())
        .filter((t): t is keyof typeof PropertiesType => t in PropertiesType)
        .map((t) => PropertiesType[t]);

      if (validTypes.length > 0) {
        whereClause.types = {
          some: {
            type: { in: validTypes },
          },
        };
      }
    }

    if (market) {
      whereClause.market = { contains: market, mode: 'insensitive' };
    }

    if (subMarket) {
      whereClause.subMarket = { contains: subMarket, mode: 'insensitive' };
    }

    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) {
        whereClause.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        whereClause.createdAt.lte = new Date(dateTo);
      }
    }

    // 🔒 Restrict non-admin users
    if (selectedRole !== Role.SUPER_ADMIN && selectedRole !== Role.ADMIN) {
      whereClause.propertyUsers = {
        some: {
          userId,
          userRole: { role: { equals: selectedRole } },
        },
      };
    }

    // Query
    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        where: whereClause,
        select: {
          id: true,
          propertyId: true,
          name: true,
          status: true,
          updatedAt: true,
          createdAt: true,
          yearBuilt: true,
          market: true,
          subMarket: true,
          propertyAddress: { select: { formatedAddress: true } },
          otherInfo: {
            select: { dealStructure: true, lastSale_or_rentPrice: true, imageIds: true },
          },
          attachments: { select: { id: true, filePath: true } },
          types: { select: { type: true } },
        },
        orderBy: { id: 'desc' },
        skip: validOffset,
        take: validLimit,
      }),
      this.prisma.property.count({ where: whereClause }),
    ]);

    const hasMore = validOffset + properties.length < total;

    // 🧮 Transform and flatten response structure
    const transformedProperties = properties.map((property) => {
      // Filter attachments by imageIds from otherInfo
      const imageIds = property.otherInfo?.imageIds || [];
      const filteredAttachments = property.attachments.filter((attachment) =>
        imageIds.includes(attachment.id),
      );

      return {
        id: property.id,
        propertyId: property.propertyId,
        name: property.name,
        address: property.propertyAddress?.formatedAddress ?? '',
        status: property.status,
        updatedAt: property.updatedAt,
        createdAt: property.createdAt,
        type: property.types.map((t) => t.type),
        dealStructure: property.otherInfo?.dealStructure ?? null,
        lastSale_or_rentPrice: property.otherInfo?.lastSale_or_rentPrice ?? '',
        attachments: filteredAttachments.map((attachment) => attachment.filePath),
        yearBuilt: property.yearBuilt,
        market: property.market,
        subMarket: property.subMarket,
      };
    });

    return {
      properties: plainToInstance(AllPropertiesResponseDto, transformedProperties, {
        excludeExtraneousValues: true,
      }),
      total,
      offset: validOffset,
      limit: validLimit,
      hasMore,
    };
  }

  async getMapProperties(query: GetMapPropertiesQueryDto): Promise<{
    properties: PropertyMapResponseDto[];
  }> {
    const { status = [], types = [], market, subMarket, minLat, maxLat, minLng, maxLng } = query;

    // 🧱 Build where clause dynamically
    const whereClause: any = {
      propertyAddress: {
        isNot: null,
      },
    };

    // Filter by status
    if (status.length > 0) {
      whereClause.status = { in: status };
    }

    // Filter by property types
    if (types.length > 0) {
      const validTypes = types
        .map((t) => t.toUpperCase())
        .filter((t): t is keyof typeof PropertiesType => t in PropertiesType)
        .map((t) => PropertiesType[t]);

      if (validTypes.length > 0) {
        whereClause.types = {
          some: {
            type: { in: validTypes },
          },
        };
      }
    }

    // Filter by market
    if (market) {
      whereClause.market = { contains: market, mode: 'insensitive' };
    }

    // Filter by sub-market
    if (subMarket) {
      whereClause.subMarket = { contains: subMarket, mode: 'insensitive' };
    }

    // Filter by map bounds (latitude and longitude)
    if (
      minLat !== undefined ||
      maxLat !== undefined ||
      minLng !== undefined ||
      maxLng !== undefined
    ) {
      const locationFilter: any = {};

      if (minLat !== undefined && maxLat !== undefined) {
        locationFilter.latitude = { gte: minLat, lte: maxLat };
      } else if (minLat !== undefined) {
        locationFilter.latitude = { gte: minLat };
      } else if (maxLat !== undefined) {
        locationFilter.latitude = { lte: maxLat };
      }

      if (minLng !== undefined && maxLng !== undefined) {
        locationFilter.longitude = { gte: minLng, lte: maxLng };
      } else if (minLng !== undefined) {
        locationFilter.longitude = { gte: minLng };
      } else if (maxLng !== undefined) {
        locationFilter.longitude = { lte: maxLng };
      }

      // Apply location filter to propertyAddress relation using 'is'
      if (Object.keys(locationFilter as Record<string, unknown>).length > 0) {
        whereClause.propertyAddress = {
          is: {
            ...locationFilter,
          },
        };
      }
    }

    // 🔍 Query properties with minimal fields for map display
    const properties = await this.prisma.property.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        propertyAddress: {
          select: {
            formatedAddress: true,
            latitude: true,
            longitude: true,
          },
        },
        attachments: true,
      },
    });

    // 🧮 Transform numeric fields and format response
    const transformedProperties = properties.map((property) => ({
      id: property.id,
      name: property.name,
      propertyAddress: property.propertyAddress
        ? {
            address: property.propertyAddress.formatedAddress,
            latitude: property.propertyAddress.latitude
              ? Number(property.propertyAddress.latitude)
              : null,
            longitude: property.propertyAddress.longitude
              ? Number(property.propertyAddress.longitude)
              : null,
          }
        : undefined,
      attachments: property.attachments || [],
    }));

    return {
      properties: plainToInstance(PropertyMapResponseDto, transformedProperties, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async getPropertyById(
    propertyRecordId: number,
    user: UserResponseDto,
  ): Promise<PropertyResponseDto> {
    const { id: userId, selectedRole } = user;
    // Enhanced include for all step-wise data
    const propertyInclude = {
      propertyUsers: {
        select: {
          userRole: true, // include role details
          userRoleId: true,
        },
      },
      types: true, // PropertyTypeOnProperty relations
      otherInfo: true, // PropertyOtherInfo
      propertyUtilities: true, // PropertyUtilities
      attachments: true, // Attachments
      ownerInfo: true, // PropertyOwnerInfo
      propertyAddress: true, // PropertyAddress
      inviteRoles: {
        where: {
          propertyId: propertyRecordId,
          NOT: {
            userInvite: { email: user?.email },
          },
        },
        select: {
          id: true,
          role: true,
          status: true,
          createdAt: true,
          acceptedAt: true,
          userInvite: {
            select: {
              email: true,
            },
          },
        },
      },
    };

    let property;
    if (selectedRole === Role.SUPER_ADMIN || selectedRole === Role.ADMIN) {
      // Super admin can access any property
      property = await this.prisma.property.findUnique({
        where: { id: propertyRecordId },
        include: propertyInclude,
      });
    } else {
      // Regular users can only access properties they have access to
      property = await this.prisma.property.findFirst({
        where: {
          id: propertyRecordId,
          propertyUsers: {
            some: {
              userId,
              userRole: {
                role: { equals: selectedRole },
              },
            },
          },
        },
        include: propertyInclude,
      });
    }

    if (!property) {
      throw new NotFoundException('Property not found or access denied');
    }

    // Transform Decimal fields to numbers for proper serialization

    const transformedProperty: any = {
      ...property,

      area: property.area ? Number(property.area) : 0,

      grossArea: property.grossArea ? Number(property.grossArea) : 0,
    };

    if (property.propertyAddress) {
      transformedProperty.propertyAddress = {
        ...property.propertyAddress,
        latitude: property.propertyAddress.latitude
          ? Number(property.propertyAddress.latitude)
          : null,
        longitude: property.propertyAddress.longitude
          ? Number(property.propertyAddress.longitude)
          : null,
      };
    }

    if (property.otherInfo) {
      transformedProperty.otherInfo = {
        ...property.otherInfo,
        landSize: property.otherInfo.landSize ? Number(property.otherInfo.landSize) : 0,
        grossBuildingArea: property.otherInfo.grossBuildingArea
          ? Number(property.otherInfo.grossBuildingArea)
          : 0,
        lastSale_or_rentPrice: property.otherInfo.lastSale_or_rentPrice ?? '',
      };
    } else {
      transformedProperty.otherInfo = null;
    }

    // Parse utilities from JSON string in PropertyOtherInfo

    transformedProperty.propertyUtilities = property.otherInfo?.utilities
      ? JSON.parse(String(property.otherInfo.utilities))
      : [];

    return transformedProperty as PropertyResponseDto;
  }

  async verifyCurrentUserIsPropertyUser(
    propertyId: string,
    user: UserResponseDto,
  ): Promise<PropertyUser | null> {
    if (user) {
      const property = await this.prisma.property.findUnique({ where: { propertyId } });
      if (property) {
        const propertyUser = await this.prisma.propertyUser.findFirst({
          where: {
            AND: [{ userId: user.id }, { propertyId: property.id }],
          },
        });

        return propertyUser;
      }
    }

    return null;
  }

  async getPropertyPublicDetails(propertyPublicId: string): Promise<PropertyResponseDto> {
    const propertyInclude = {
      types: true,
      otherInfo: true,
      propertyUtilities: true,
      attachments: true,
      ownerInfo: true,
      propertyAddress: true,
    };

    // Super admin can access any property
    const property = await this.prisma.property.findUnique({
      where: { propertyId: propertyPublicId },
      include: propertyInclude,
    });

    if (!property) {
      throw new NotFoundException('Property not found or access denied');
    }

    const transformedProperty: any = {
      ...property,

      area: property.otherInfo?.landSize ? Number(property.otherInfo?.landSize) : 0,

      grossArea: property.otherInfo?.grossBuildingArea
        ? Number(property.otherInfo.grossBuildingArea)
        : 0,
    };

    if (property.propertyAddress) {
      transformedProperty.propertyAddress = {
        ...property.propertyAddress,
        latitude: property.propertyAddress.latitude
          ? Number(property.propertyAddress.latitude)
          : null,
        longitude: property.propertyAddress.longitude
          ? Number(property.propertyAddress.longitude)
          : null,
      };
    }

    if (property.otherInfo) {
      transformedProperty.otherInfo = {
        ...property.otherInfo,

        landSize: property.otherInfo.landSize ? Number(property.otherInfo.landSize) : 0,

        grossBuildingArea: property.otherInfo.grossBuildingArea
          ? Number(property.otherInfo.grossBuildingArea)
          : 0,
      };
    } else {
      transformedProperty.otherInfo = null;
    }

    // Parse utilities from JSON string in PropertyOtherInfo

    transformedProperty.propertyUtilities = property.otherInfo?.utilities
      ? JSON.parse(String(property.otherInfo.utilities))
      : [];

    return transformedProperty as PropertyResponseDto;
  }

  async logPropertyVisit(data: CreatePropertyScanDto): Promise<PropertyVisit> {
    const { propertyId, userAgent, userToken, source, timestamp, ip } = data;

    return this.prisma.$transaction(async (tx) => {
      // Fetch property — fail early if not found
      const property = await tx.property.findUnique({
        where: { propertyId },
        select: { id: true },
      });

      if (!property) {
        throw new Error(`Property not found: ${propertyId}`);
      }

      const userEmail = userToken
        ? this.authService.decodeToken(userToken)?.decodedEmail
        : undefined;
      let user;
      if (userEmail) user = await tx.user.findUnique({ where: { email: userEmail } });
      // Log activity
      await tx.activityLog.create({
        data: {
          action: ActivityActions.PROPERTY_VISITED_BY_USER,
          entityId: property.id,
          entityType: ActivityEntityTypes.PROPERTY,
          description: `${user ? user.fullName : 'Someone'} scanned property QR code.`,
          metadata: {
            user: user ?? undefined,
            propertyId: property.id,
          },
        },
      });
      // Log visit
      return tx.propertyVisit.create({
        data: {
          propertyId,
          userToken: userToken ?? null,
          ip,
          source,
          userAgent,
          timestamp: timestamp ? new Date(timestamp) : new Date(),
        },
      });
    });
  }

  async createPropertyEnquiry(
    propertyId: string,
    data: CreatePropertyEnquiryDto,
  ): Promise<PropertyEnquiry> {
    const result = await this.prisma.$transaction(async (tx) => {
      const property = await tx.property.findUnique({
        where: { propertyId },
        include: { ownerInfo: true },
      });

      const enquiry = await tx.propertyEnquiry.create({
        data: {
          propertyId,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone ?? null,
          message: data?.message ?? '',
          applyTypes: data.applyTypes,
          enquiryTypes: data.enquiryTypes,
          enquiryReason: data.enquiryReason,
        },
        include: { property: true },
      });

      return { property, enquiry };
    });

    const { property, enquiry } = result;

    // Email sending must be OUTSIDE the transaction
    if (property?.ownerInfo) {
      const propertyUrl = `${this.configService.get<string>('WEBSITE_URL')}/properties/${property.id}`;

      await this.emailService.sendEmail(EmailType.PROPERTY_ENQUIRY, {
        recipientEmail: property.ownerInfo.email,
        propertyOwnerName: property.ownerInfo.name,
        propertyName: property.name ?? '',
        enquirerName: data.fullName,
        enquirerEmail: data.email,
        enquirerPhone: data.phone ?? undefined,
        enquiryMessage: data?.message ?? '',
        applyTypes: data.applyTypes.map((type) => PropertyEnquiryApplyTypeLabels[type] || ''),
        enquiryTypes: data.enquiryTypes.map(
          (enquireType) => PropertyEnquiryTypeLabels[enquireType] || '',
        ),
        enquiryReason: PropertyEnquiryReasonTypeLables[data.enquiryReason] ?? '',
        propertyUrl,
        createdAt: enquiry.createdAt.toString(),
      });
    }
    await this.activityService.logActivity({
      action: ActivityActions.PROPERTY_ENQUIRY,
      entityId: property?.id,
      entityType: ActivityEntityTypes.PROPERTY,
      description: `You have an enquiry form ${data.fullName} on property`,
      metadata: {
        propertyId: property?.id,
        enquiry: enquiry,
      },
    });

    return enquiry;
  }

  async bulkCreateProperties(
    user: UserResponseDto,
    dto: BulkCreatePropertyDto,
  ): Promise<{ count: number; message: string }> {
    const { properties } = dto;

    // 1️⃣ Generate unique propertyIds
    const propertiesWithGeneratedIds = properties.map((p) => {
      const propertyId = generatePropertyId(
        p.country ?? 'US',
        p.state ?? 'MA',
        p.city ?? 'CAMB',
        p.zipCode ?? '02139',
      );

      return {
        ...p,
        propertyId,
        name: p.propertyName,
        createdById: user.id,
        status: PropertyStatus.DRAFT,
      };
    });

    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // 2️⃣ Insert properties (exclude address fields as they go to propertyAddress table)
        await tx.property.createMany({
          data: propertiesWithGeneratedIds.map(
            ({
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              propertyTypes,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              propertyName,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ownerCompany,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ownerEmail,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ownerName,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ownerPhoneNumber,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              address,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              city,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              state,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              country,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              zipCode,
              ...rest
            }) => rest,
          ),
        });

        // 3️⃣ Fetch newly created properties (by propertyId)
        const fetchedProperties = await tx.property.findMany({
          where: {
            propertyId: {
              in: propertiesWithGeneratedIds.map((p) => p.propertyId),
            },
          },
          select: { id: true, propertyId: true },
        });

        // 4️⃣ Prepare data for `PropertyTypeOnProperty`, `PropertyOwnerInfo`, and `PropertyAddress`
        const propertyTypes: Prisma.PropertyTypeOnPropertyCreateManyInput[] = [];
        const ownerInfos: Prisma.PropertyOwnerInfoCreateManyInput[] = [];
        const propertyAddresses: Prisma.PropertyAddressCreateManyInput[] = [];

        for (const { id, propertyId } of fetchedProperties) {
          const propertyData = propertiesWithGeneratedIds.find((p) => p.propertyId === propertyId);

          if (!propertyData) {
            throw new Error(`No property data found for propertyId: ${propertyId}`);
          }

          // Add property types to the `PropertyTypeOnProperty` join table
          for (const type of propertyData.propertyTypes) {
            propertyTypes.push({
              propertyId: id,
              type,
            });
          }

          // Add owner information
          ownerInfos.push({
            propertyRecordId: id,
            name: propertyData.ownerName,
            phoneNumber: propertyData.ownerPhoneNumber,
            email: propertyData.ownerEmail,
            company: propertyData.ownerCompany,
          });

          // Add property address information
          propertyAddresses.push({
            propertyRecordId: id,
            formatedAddress: propertyData.address || '',
            city: propertyData.city || '',
            state: propertyData.state || '',
            country: propertyData.country || '',
            zipCode: propertyData.zipCode || '',
          });
        }

        // 5️⃣ Insert property types (join table)
        if (propertyTypes.length > 0) {
          await tx.propertyTypeOnProperty.createMany({
            data: propertyTypes,
            skipDuplicates: true,
          });
        }

        // 6️⃣ Insert owner information
        if (ownerInfos.length > 0) {
          await tx.propertyOwnerInfo.createMany({
            data: ownerInfos,
            skipDuplicates: true,
          });
        }

        // 7️⃣ Insert property addresses
        if (propertyAddresses.length > 0) {
          await tx.propertyAddress.createMany({
            data: propertyAddresses,
            skipDuplicates: true,
          });
        }

        // 8️⃣ Return structured response
        return {
          count: properties.length,
          message: `${properties.length} properties successfully created with types.`,
        };
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to bulk create properties: ${error.message}`);
      }
      throw new Error('Failed to bulk create properties due to an unknown error.');
    }
  }

  // Step-wise update methods
  async updateFoundationalData(
    propertyRecordId: number,
    updateData: UpdateFoundationalDataDto,
    currentUser: UserResponseDto,
  ): Promise<void> {
    // Check if property exists and user has permission
    await this.checkPropertyPermission(propertyRecordId, currentUser);

    const {
      propertyName,
      addressData,
      secondaryType,
      isResidential,
      isCommercial,
      isIndustrial,
      isMultiFamily,
      isRetail,
      isOffice,
      isLandAndDevelopment,
      isGsa,
      isSpecialUse,
      isHospitality,
      buildingClass,
      occupancyType,
      ownerName,
      ownerPhoneNumber,
      ownerEmail,
      ownerCompany,
      market,
      subMarket,
    } = updateData;

    // Validate at least one property type is selected
    const hasPropertyType =
      isResidential ||
      isCommercial ||
      isIndustrial ||
      isMultiFamily ||
      isRetail ||
      isOffice ||
      isLandAndDevelopment ||
      isGsa ||
      isSpecialUse ||
      isHospitality;

    if (!hasPropertyType) {
      throw new BadRequestException('At least one property type must be selected');
    }

    // Update property basic info
    await this.prisma.property.update({
      where: { id: propertyRecordId },
      data: {
        name: propertyName,
        secondaryType,
        buildingClass,
        occupancyType,
        market,
        subMarket,
      },
    });

    // Update or create property address
    await this.prisma.propertyAddress.upsert({
      where: { propertyRecordId: propertyRecordId },
      update: {
        formatedAddress: addressData.address || '',
        city: addressData.city || '',
        state: addressData.state || '',
        zipCode: addressData.zipCode || '',
        country: addressData.country || '',
        latitude: addressData.latitude,
        longitude: addressData.longitude,
      },
      create: {
        propertyRecordId: propertyRecordId,
        formatedAddress: addressData.address || '',
        city: addressData.city || '',
        state: addressData.state || '',
        zipCode: addressData.zipCode || '',
        country: addressData.country || '',
        latitude: addressData.latitude,
        longitude: addressData.longitude,
      },
    });

    // Create or update PropertyOwnerInfo
    await this.prisma.propertyOwnerInfo.upsert({
      where: { propertyRecordId: propertyRecordId },
      update: {
        name: ownerName,
        phoneNumber: ownerPhoneNumber,
        email: ownerEmail,
        company: ownerCompany,
      },
      create: {
        propertyRecordId: propertyRecordId,
        name: ownerName,
        phoneNumber: ownerPhoneNumber,
        email: ownerEmail,
        company: ownerCompany,
      },
    });

    // Update property types - delete existing and create new ones
    await this.prisma.propertyTypeOnProperty.deleteMany({
      where: { propertyId: propertyRecordId },
    });

    // Create new property types based on selected checkboxes
    const propertyTypes: PropertiesType[] = [];
    if (isResidential) propertyTypes.push(PropertiesType.RESIDENTIAL);
    if (isCommercial) propertyTypes.push(PropertiesType.COMMERCIAL);
    if (isIndustrial) propertyTypes.push(PropertiesType.INDUSTRIAL);
    if (isMultiFamily) propertyTypes.push(PropertiesType.MULTI_FAMILY);
    if (isRetail) propertyTypes.push(PropertiesType.RETAIL);
    if (isOffice) propertyTypes.push(PropertiesType.OFFICE);
    if (isLandAndDevelopment) propertyTypes.push(PropertiesType.LAND_AND_DEVELOPMENT);
    if (isGsa) propertyTypes.push(PropertiesType.GSA);
    if (isSpecialUse) propertyTypes.push(PropertiesType.SPECIAL_USE);
    if (isHospitality) propertyTypes.push(PropertiesType.HOSPITALITY);

    if (propertyTypes.length > 0) {
      await this.prisma.propertyTypeOnProperty.createMany({
        data: propertyTypes.map((type) => ({
          propertyId: propertyRecordId,
          type,
        })),
      });
    }

    // Update other info (create if doesn't exist)
    await this.prisma.propertyOtherInfo.upsert({
      where: { propertyRecordId: propertyRecordId },
      update: {
        // Add building class and occupancy type fields here if they exist in schema
        // For now, we'll store them in a generic way
      },
      create: {
        propertyRecordId: propertyRecordId,
        smartTagId: '', // Default value, will be updated in step 2
        dealStructure: DealStructure.For_Sale, // Default value
        landSize: 0,
        grossBuildingArea: 0,
        use: 'Current', // Default value
        parcelId_or_apn: 0,
        safety: null,
        leaseStatus: 'Active', // Default value
        legalPropertyAddress: '',
        lastSaleDate: null,
        lastSale_or_rentPrice: '',
        blockChain_and_tokenization: 'TEXT_1', // Default value
        propertyDescription: '',
        imageIds: [],
        attachmentIds: [],
      },
    });

    await this.activityService.logActivity({
      action: ActivityActions.PROPERTY_UPDATED,
      entityId: propertyRecordId,
      entityType: ActivityEntityTypes.PROPERTY,
      description: 'Added the basic info',
      metadata: updateData,
    });
  }

  async updateOtherInfo(
    propertyRecordId: number,
    updateData: UpdateOtherInfoDto,
    currentUser: UserResponseDto,
  ): Promise<void> {
    await this.checkPropertyPermission(propertyRecordId, currentUser);

    const {
      smartTagId,
      landSqFt,
      use,
      yearBuilt,
      leaseStatus,
      lastSaleDate,
      dealStructure,
      grossBuildingArea,
      parcelId,
      legalPropertyAddress,
      blockchainTokenization,
      lastSaleRentPrice,
      propertyDescription,
      safetyInspection,
      documents,
    } = updateData;

    const score = await this.getUpdatedCompletenessScore(propertyRecordId, 60);
    // Update property basic info
    await this.prisma.property.update({
      where: { id: propertyRecordId },
      data: {
        yearBuilt,
        completenessScore: score,
      },
    });

    // Update other info
    await this.prisma.propertyOtherInfo.update({
      where: { propertyRecordId: propertyRecordId },
      data: {
        smartTagId: smartTagId || '',
        landSize: landSqFt,
        use,
        parcelId_or_apn: parseInt(parcelId),
        leaseStatus,
        lastSaleDate: lastSaleDate ? new Date(lastSaleDate) : new Date(),
        dealStructure,
        grossBuildingArea,
        legalPropertyAddress,
        lastSale_or_rentPrice: lastSaleRentPrice || '',
        blockChain_and_tokenization: blockchainTokenization,
        propertyDescription: propertyDescription || '',
        safety: safetyInspection ? new Date(safetyInspection + '-01') : new Date(),
      },
    });

    // Handle document uploads
    if (documents && documents.length > 0) {
      const attachmentsData = await Promise.all(
        documents.map(async (file: Express.Multer.File): Promise<Attachment> => {
          const s3Url: string = await this.s3Service.uploadFile(file, 'property');
          return {
            fileName: file.originalname,
            fileSize: file.size,
            fileType: file.mimetype,
            filePath: s3Url,
          };
        }),
      );

      // Create attachments and get their IDs
      const createdAttachments = await Promise.all(
        attachmentsData.map((attachment) =>
          this.prisma.attachment.create({
            data: {
              ...attachment,
              propertyId: propertyRecordId,
            },
          }),
        ),
      );

      const imageIds: number[] = [];

      createdAttachments.forEach((attachment) => {
        if (attachment.fileType.startsWith('image/')) {
          imageIds.push(attachment.id);
        }
        // Only images are handled in updateOtherInfo - documents go through separate "Attach Documents" flow
      });

      const existingOtherInfo = await this.prisma.propertyOtherInfo.findUnique({
        where: { propertyRecordId },
      });

      if (existingOtherInfo) {
        const existingImageIds = existingOtherInfo.imageIds || [];

        await this.prisma.propertyOtherInfo.update({
          where: { propertyRecordId },
          data: {
            imageIds: imageIds.length > 0 ? [...existingImageIds, ...imageIds] : existingImageIds,
          },
        });
      } else {
        await this.prisma.propertyOtherInfo.create({
          data: {
            propertyRecordId,
            imageIds: imageIds.length > 0 ? imageIds : [],
            attachmentIds: [],
          },
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { documents: _, ...activityMetadata } = updateData;
      await this.activityService.logActivity({
        action: ActivityActions.PROPERTY_UPDATED,
        entityId: propertyRecordId,
        entityType: ActivityEntityTypes.PROPERTY,
        description: 'Added the other info',
        metadata: {
          ...activityMetadata,
          attachment: attachmentsData.map((attachment) => ({
            link: attachment.filePath,
            name: attachment.fileName,
          })),
        },
      });
    }
  }

  async updateUtilitiesAttachments(
    propertyRecordId: number,
    updateData: UpdateUtilitiesAttachmentsDto,
    currentUser: UserResponseDto,
  ): Promise<void> {
    await this.checkPropertyPermission(propertyRecordId, currentUser);

    const { utilities, documents } = updateData;

    // Handle utilities - store as JSON in PropertyOtherInfo
    if (utilities && utilities.length > 0) {
      // Validate all utilities before creating
      for (const utility of utilities) {
        if (!isValidUtility(utility.utility)) {
          throw new BadRequestException(`Invalid utility type: ${String(utility.utility)}`);
        }
      }

      // Store utilities as JSON in PropertyOtherInfo
      const utilitiesJson = JSON.stringify(utilities);
      const score = await this.getUpdatedCompletenessScore(propertyRecordId, 80);

      await this.prisma.property.update({
        where: { id: propertyRecordId },
        data: {
          completenessScore: score,
        },
      });
      // Update or create PropertyOtherInfo with utilities
      await this.prisma.propertyOtherInfo.upsert({
        where: { propertyRecordId: propertyRecordId },
        update: { utilities: utilitiesJson },
        create: {
          propertyRecordId: propertyRecordId,
          utilities: utilitiesJson,
        },
      });
    } else {
      // If no utilities, remove the utilities field
      await this.prisma.propertyOtherInfo.updateMany({
        where: { propertyRecordId: propertyRecordId },
        data: { utilities: null },
      });
    }
    let attachmentsData: Attachment[] = [];
    // Handle document uploads
    if (documents && documents.length > 0) {
      attachmentsData = await Promise.all(
        documents.map(async (file: Express.Multer.File): Promise<Attachment> => {
          const s3Url: string = await this.s3Service.uploadFile(file, 'property');
          return {
            fileName: file.originalname,
            fileSize: file.size,
            fileType: file.mimetype,
            filePath: s3Url,
          };
        }),
      );

      // Create attachments and get their IDs
      const createdAttachments = await Promise.all(
        attachmentsData.map((attachment) =>
          this.prisma.attachment.create({
            data: {
              ...attachment,
              propertyId: propertyRecordId,
            },
          }),
        ),
      );

      const attachmentIds: number[] = createdAttachments.map((attachment) => attachment.id);

      const existingOtherInfo = await this.prisma.propertyOtherInfo.findUnique({
        where: { propertyRecordId },
      });

      if (existingOtherInfo) {
        const existingImageIds = existingOtherInfo.imageIds || [];
        const existingAttachmentIds = existingOtherInfo.attachmentIds || [];

        await this.prisma.propertyOtherInfo.update({
          where: { propertyRecordId },
          data: {
            imageIds: existingImageIds,
            attachmentIds: [...existingAttachmentIds, ...attachmentIds],
          },
        });
      } else {
        await this.prisma.propertyOtherInfo.create({
          data: {
            propertyRecordId,
            utilities: utilities && utilities.length > 0 ? JSON.stringify(utilities) : null,
            imageIds: [],
            attachmentIds: attachmentIds,
          },
        });
      }
    }

    await this.activityService.logActivity({
      action: ActivityActions.PROPERTY_UPDATED,
      entityId: propertyRecordId,
      entityType: ActivityEntityTypes.PROPERTY,
      description: 'Added utilities and attachments',
      metadata: {
        utilities: utilities,
        attachments: attachmentsData.map((attachment) => ({
          link: attachment.filePath,
          name: attachment.fileName,
        })),
      },
    });
  }

  async updateInvitations(
    propertyId: number,
    updateData: UpdateInvitationsDto,
    currentUser: UserResponseDto,
  ): Promise<void> {
    await this.checkPropertyPermission(propertyId, currentUser);

    const { invites } = updateData;

    // Get the property business ID (propertyId field) for the invitations service
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { propertyId: true },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (!property.propertyId) {
      throw new BadRequestException('Property business ID is missing');
    }
    const score = await this.getUpdatedCompletenessScore(propertyId, 100);

    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        completenessScore: score,
      },
    });
    // Send invites
    if (invites && invites.length > 0) {
      try {
        const tasks = invites.map((inv) =>
          this.invitationsService.inviteToProperty({
            invitedById: currentUser.id,
            email: inv.email,
            roles: inv.roles,
            propertyId: property.propertyId, // Use the business ID string
          }),
        );
        await Promise.allSettled(tasks);
      } catch (error) {
        console.error('Error sending invitations:', error);
        throw new BadRequestException('Failed to send invitations');
      }
    }

    // Update property status to WAITING_UPDATE_APPROVAL after successful invitation processing
    await this.prisma.property.update({
      where: { id: propertyId },
      data: { status: PropertyStatus.WAITING_UPDATE_APPROVAL },
    });

    await this.activityService.logActivity({
      action: ActivityActions.PROPERTY_UPDATED,
      entityId: propertyId,
      entityType: ActivityEntityTypes.PROPERTY,
      description: 'Update the invitations',
      metadata: updateData,
    });
  }

  private async checkPropertyPermission(
    propertyId: number,
    currentUser: UserResponseDto,
  ): Promise<void> {
    // Check if property exists
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        propertyUsers: {
          where: { userId: currentUser.id },
        },
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    // Check if user has permission (is creator or has access through PropertyUser)
    const isCreator = property.createdById === currentUser.id;
    const hasAccess = property.propertyUsers.length > 0;
    const isAdmin =
      currentUser.selectedRole === Role.SUPER_ADMIN || currentUser.selectedRole === Role.ADMIN;

    if (!isCreator && !hasAccess && !isAdmin) {
      throw new ForbiddenException('You do not have permission to update this property');
    }
  }

  async deleteAttachment(
    propertyRecordId: number,
    attachmentId: number,
    currentUser: UserResponseDto,
    isPropertyPhoto: boolean,
  ): Promise<void> {
    await this.checkPropertyPermission(propertyRecordId, currentUser);

    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        propertyId: propertyRecordId,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // 🔹 Best-effort S3 deletion (outside transaction)
    try {
      await this.s3Service.deleteFile(attachment.filePath);
    } catch (error) {
      this.logger.warn(`Failed to delete file from S3: ${attachment.filePath}`, error);
    }

    // 🔹 Single DB transaction
    await this.prisma.$transaction(async (tx) => {
      // Delete attachment record
      await tx.attachment.delete({
        where: { id: attachmentId },
      });

      const propertyOtherInfo = await tx.propertyOtherInfo.findUnique({
        where: { propertyRecordId },
        select: {
          attachmentIds: true,
          imageIds: true,
        },
      });

      if (!propertyOtherInfo) return;

      const data: any = {
        attachmentIds: propertyOtherInfo.attachmentIds.filter((id) => id !== attachmentId),
      };

      if (isPropertyPhoto) {
        data.imageIds = propertyOtherInfo.imageIds.filter((id) => id !== attachmentId);
      }

      await tx.propertyOtherInfo.update({
        where: { propertyRecordId },
        data,
      });
    });

    // 🔹 Activity log (outside transaction)
    await this.activityService.logActivity({
      action: ActivityActions.PROPERTY_REMOVE_ATTACHMENT,
      entityId: propertyRecordId,
      entityType: ActivityEntityTypes.PROPERTY,
      description: 'Remove document from property.',
      metadata: {
        id: attachment.id,
        name: attachment.fileName,
        propertyId: propertyRecordId,
        url: attachment.filePath,
      },
    });

    this.logger.log(
      `Attachment ${attachmentId} deleted successfully for property ${propertyRecordId}`,
    );
  }

  async updateOverview(
    propertyId: number,
    updateData: UpdateOverviewDto,
    currentUser: UserResponseDto,
  ): Promise<void> {
    await this.checkPropertyPermission(propertyId, currentUser);

    const {
      propertyName,
      addressData,
      secondaryType,
      isResidential,
      isCommercial,
      isIndustrial,
      isMultiFamily,
      isRetail,
      isOffice,
      isLandAndDevelopment,
      isGsa,
      isSpecialUse,
      isHospitality,
      buildingClass,
      occupancyType,
      market,
      subMarket,
      smartTagId,
      landSqFt,
      use,
      yearBuilt,
      leaseStatus,
      lastSaleDate,
      dealStructure,
      grossBuildingArea,
      parcelId,
      safetyInspection,
      legalPropertyAddress,
      blockchainTokenization,
      lastSaleRentPrice,
      propertyDescription,
    } = updateData;

    // Start a transaction to update both foundational data and other info
    await this.prisma.$transaction(async (tx) => {
      // Update foundational data
      await tx.property.update({
        where: { id: propertyId },
        data: {
          name: propertyName,
          secondaryType,
          buildingClass,
          occupancyType,
          market,
          subMarket,
          yearBuilt,
        },
      });

      // Update or create property address
      await tx.propertyAddress.upsert({
        where: { propertyRecordId: propertyId },
        update: {
          formatedAddress: addressData.address || '',
          city: addressData.city || '',
          state: addressData.state || '',
          zipCode: addressData.zipCode || '',
          country: addressData.country || '',
          latitude: addressData.latitude,
          longitude: addressData.longitude,
        },
        create: {
          propertyRecordId: propertyId,
          formatedAddress: addressData.address || '',
          city: addressData.city || '',
          state: addressData.state || '',
          zipCode: addressData.zipCode || '',
          country: addressData.country || '',
          latitude: addressData.latitude,
          longitude: addressData.longitude,
        },
      });

      // Update property types
      await tx.propertyTypeOnProperty.deleteMany({
        where: { propertyId },
      });

      const propertyTypes: Array<{ propertyId: number; type: PropertiesType }> = [];
      if (isResidential) propertyTypes.push({ propertyId, type: PropertiesType.RESIDENTIAL });
      if (isCommercial) propertyTypes.push({ propertyId, type: PropertiesType.COMMERCIAL });
      if (isIndustrial) propertyTypes.push({ propertyId, type: PropertiesType.INDUSTRIAL });
      if (isMultiFamily) propertyTypes.push({ propertyId, type: PropertiesType.MULTI_FAMILY });
      if (isRetail) propertyTypes.push({ propertyId, type: PropertiesType.RETAIL });
      if (isOffice) propertyTypes.push({ propertyId, type: PropertiesType.OFFICE });
      if (isLandAndDevelopment)
        propertyTypes.push({ propertyId, type: PropertiesType.LAND_AND_DEVELOPMENT });
      if (isGsa) propertyTypes.push({ propertyId, type: PropertiesType.GSA });
      if (isSpecialUse) propertyTypes.push({ propertyId, type: PropertiesType.SPECIAL_USE });
      if (isHospitality) propertyTypes.push({ propertyId, type: PropertiesType.HOSPITALITY });

      if (propertyTypes.length > 0) {
        await tx.propertyTypeOnProperty.createMany({
          data: propertyTypes,
        });
      }

      // Update other info
      await tx.propertyOtherInfo.upsert({
        where: { propertyRecordId: propertyId },
        update: {
          smartTagId,
          landSize: landSqFt,
          use,
          leaseStatus,
          lastSaleDate: new Date(lastSaleDate),
          dealStructure,
          grossBuildingArea,
          parcelId_or_apn: parseInt(parcelId),
          safety: safetyInspection ? new Date(safetyInspection + '-01') : null,
          legalPropertyAddress,
          blockChain_and_tokenization: blockchainTokenization,
          lastSale_or_rentPrice: lastSaleRentPrice,
          propertyDescription,
        },
        create: {
          propertyRecordId: propertyId,
          smartTagId,
          landSize: landSqFt,
          use,
          leaseStatus,
          lastSaleDate: new Date(lastSaleDate),
          dealStructure,
          grossBuildingArea,
          parcelId_or_apn: parseInt(parcelId),
          safety: safetyInspection ? new Date(safetyInspection + '-01') : null,
          legalPropertyAddress,
          blockChain_and_tokenization: blockchainTokenization,
          lastSale_or_rentPrice: lastSaleRentPrice,
          propertyDescription,
        },
      });
    });
    await this.activityService.logActivity({
      action: ActivityActions.PROPERTY_UPDATED,
      entityId: propertyId,
      entityType: ActivityEntityTypes.PROPERTY,
      description: 'Updated property overview details',
      metadata: updateData,
    });
    this.logger.log(`Property overview updated successfully for property ${propertyId}`);
  }

  /**
   * Manually trigger Lambda update for a published property
   * This can be called via API endpoint to manually sync blockchain
   */
  async syncPropertyToBlockchain(
    propertyRecordId: number,
    currentUser: UserResponseDto,
  ): Promise<{ message: string }> {
    const [property, userDetails] = await Promise.all([
      this.prisma.property.findUnique({
        where: { id: propertyRecordId },
        select: {
          id: true,
          propertyId: true,
          name: true,
          tokenId: true,
          secondaryType: true,
          attachments: {
            select: {
              id: true,
              filePath: true,
            },
          },
          types: {
            select: {
              type: true,
            },
          },
          otherInfo: {
            select: {
              attachmentIds: true,
              imageIds: true,
            },
          },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: currentUser.id },
        select: { email: true, fullName: true },
      }),
    ]);

    // Early validation checks
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (!property.tokenId) {
      throw new BadRequestException(
        'Property must be published (have tokenId) before it can be synced to blockchain. Use publish endpoint first.',
      );
    }

    // Include ALL attachments that are in attachmentIds (all files in attachmentIds go to metadata)
    const attachmentIds = property.otherInfo?.attachmentIds || [];
    const attachmentsForMetadata = property.attachments.filter((attachment) =>
      attachmentIds.includes(attachment.id),
    );

    if (!attachmentsForMetadata || attachmentsForMetadata.length === 0) {
      throw new BadRequestException(
        'Property must have at least one attachment in attachmentIds to sync to blockchain',
      );
    }

    if (!userDetails?.email) {
      throw new BadRequestException('User email not found');
    }

    // Include all attachments from attachmentIds in fileUrls
    const fileUrls = attachmentsForMetadata.map((attachment) => attachment.filePath);
    const propertyType =
      property.types && property.types.length > 0
        ? property.types.map((t) => t.type).join(', ')
        : property.secondaryType
          ? String(property.secondaryType)
          : '';

    this.logger.log(
      `Manually syncing property ${property.propertyId} to blockchain with ${fileUrls.length} attachments from attachmentIds`,
    );

    try {
      const balanceEth = await this.blockchainService.getWalletBalanceEth();
      const balanceWei = parseFloat(balanceEth);

      if (balanceWei === 0) {
        this.logger.warn(`Wallet balance is zero: ${balanceEth} POL`);
        const errorMessage = `Insufficient balance in wallet. Current balance: ${balanceEth} POL. Please add funds to complete the transaction.`;
        if (property) {
          await this.activityService.logActivity({
            action: ActivityActions.PROPERTY_SYNC_BALANCE_ERROR,
            entityType: ActivityEntityTypes.PROPERTY,
            entityId: property.id,
            description: errorMessage,
            metadata: {
              propertyId: property.propertyId,
              balance: balanceEth,
              errorType: 'zero_balance',
            },
          });
        }

        throw new BadRequestException(errorMessage);
      }

      const minimumBalanceWei = BigInt(Math.floor(0.005 * 1e18));
      const balanceWeiBigInt = BigInt(Math.floor(balanceWei * 1e18));

      if (balanceWeiBigInt < minimumBalanceWei) {
        this.logger.warn(
          `Wallet balance below minimum threshold: ${balanceEth} POL < 0.005 POL required`,
        );
        const errorMessage = `Insufficient balance in wallet. Current balance: ${balanceEth} POL. Minimum required: 0.005 POL. Please add funds to complete the transaction.`;
        if (property) {
          await this.activityService.logActivity({
            action: ActivityActions.PROPERTY_SYNC_BALANCE_ERROR,
            entityType: ActivityEntityTypes.PROPERTY,
            entityId: property.id,
            description: errorMessage,
            metadata: {
              propertyId: property.propertyId,
              balance: balanceEth,
              minimumRequired: '0.005',
              errorType: 'insufficient_balance',
            },
          });
        }

        throw new BadRequestException(errorMessage);
      }

      this.logger.log(
        `Wallet balance check passed: ${balanceEth} POL (above minimum threshold of 0.005 POL).`,
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to check wallet balance: ${errorMessage}`);
      throw new BadRequestException(
        `Failed to verify wallet balance. Please try again later. Error: ${errorMessage}`,
      );
    }

    this.processBlockchainJob({
      action: 'update',
      propertyId: property.propertyId,
      propertyName: property.name,
      propertyType,
      fileUrls,
      userId: currentUser.id,
      userEmail: userDetails.email,
      userFullName: userDetails.fullName,
      tokenId: property.tokenId,
    }).catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Background blockchain sync job failed for property ${property.propertyId}: ${errorMessage}`,
      );
    });

    return {
      message: 'Property blockchain sync job started successfully',
    };
  }

  /**
   * Background method to process blockchain job (Lambda invocation, DB update, email)
   */
  private async processBlockchainJob(payload: {
    action: 'register' | 'update';
    propertyId: string;
    propertyName: string;
    propertyType?: string;
    fileUrls: string[];
    userId: number;
    userEmail: string;
    userFullName: string;
    tokenId?: number;
  }): Promise<void> {
    const {
      action,
      propertyId,
      propertyName,
      propertyType,
      fileUrls,
      userId,
      userEmail,
      userFullName,
      tokenId,
    } = payload;

    try {
      this.logger.log(
        `Processing blockchain ${action} job for property ${propertyId}, propertyType: "${propertyType || 'NOT PROVIDED'}"`,
      );

      // IDEMPOTENCY CHECK: Skip if property already has tokenId (already processed)
      const existingProperty = await this.prisma.property.findUnique({
        where: { propertyId },
        select: { tokenId: true, status: true, id: true, createdById: true, name: true },
      });

      if (existingProperty?.tokenId && action === 'register') {
        this.logger.warn(
          `Property ${propertyId} already has tokenId ${existingProperty.tokenId}. Skipping duplicate processing.`,
        );
        return;
      }

      this.logger.log(`Invoking Lambda function for property ${propertyId}...`);

      const result = await this.lambdaService.invokePropertyCreation({
        action,
        propertyId,
        propertyName,
        propertyType,
        fileUrls,
        userId,
        userEmail,
        userFullName,
        tokenId,
      });

      // Validate result structure
      if (!result || !result.data) {
        this.logger.error(
          `Lambda response is missing data field. Result: ${JSON.stringify(result)}`,
        );
        throw new Error(
          `Invalid Lambda response structure: missing data field. Result: ${JSON.stringify(result)}`,
        );
      }

      if (!result.data.tokenId || !result.data.transactionHash || !result.data.metadataCID) {
        this.logger.error(
          `Lambda response is missing required fields. Result: ${JSON.stringify(result)}`,
        );
        throw new Error(
          `Lambda response missing required fields. Expected: tokenId, transactionHash, metadataCID. Got: ${JSON.stringify(result.data)}`,
        );
      }

      this.logger.log(
        `Lambda execution completed for property ${propertyId}. tokenId=${result.data.tokenId}, txHash=${result.data.transactionHash}, cid=${result.data.metadataCID}`,
      );

      this.logger.log(`Updating property ${propertyId} in database with blockchain data...`);

      const updatedProperty = await this.prisma.property.update({
        where: { propertyId: propertyId },
        data: {
          tokenId: result.data.tokenId,
          transactionHash: result.data.transactionHash,
          documentsCID: result.data.metadataCID,
          status: PropertyStatus.APPROVED,
        },
        select: { id: true, createdById: true, name: true },
      });

      if (!existingProperty) {
        this.logger.error(`Property record not found for propertyId: ${propertyId}`);
        throw new Error(`Property record not found for propertyId: ${propertyId}`);
      }

      // Send notification when property is approved (only for 'register' action)
      if (action === 'register') {
        try {
          // Tier 1 roles (SUPER_ADMIN, ADMIN, OWNER, PROPERTY_OWNER)
          const tier1Roles = getRolesForTier(Tier.TIER1);
          const tier1Users = await this.prisma.user.findMany({
            where: {
              userRoles: {
                some: {
                  role: { in: tier1Roles },
                  status: RoleStatus.ACTIVE,
                },
              },
            },
            select: { id: true },
          });

          // Include property creator (if present) and all tier 1 users
          const targetUserIds = Array.from(
            new Set(
              [updatedProperty.createdById, ...tier1Users.map((u) => u.id)].filter(
                (id): id is number => typeof id === 'number',
              ),
            ),
          );

          for (const userId of targetUserIds) {
            const notificationData = this.notificationService.preparePropertyApprovedNotification({
              userId,
              propertyId: updatedProperty.id,
              propertyName: updatedProperty.name,
              tokenId: result.data.tokenId,
            });
            await this.notificationQueueService.enqueueNotification(notificationData);
          }
        } catch (notificationError) {
          // Log error but don't fail the operation
          this.logger.error(
            `Failed to queue property approved notification for property ${propertyId}:`,
            notificationError,
          );
        }
      }

      // Send email notification only for 'register' action (not for 'update' from sync-blockchain)
      if (action === 'register') {
        try {
          const actionUrl = `${process.env.WEBSITE_URL}/properties/${existingProperty.id}/add-info`;

          await this.emailService.sendEmail(EmailType.BLOCKCHAIN_TRANSACTION_COMPLETED, {
            recipientEmail: userEmail,
            recipientName: userFullName,
            propertyName,
            propertyId: propertyId,
            transactionHash: result.data.transactionHash,
            tokenId: result.data.tokenId,
            explorerUrl: `https://etherscan.io/tx/${result.data.transactionHash}`,
            actionUrl,
            chainName: BLOCKCHAIN.CHAIN_NAME,
            action,
          });

          this.logger.log(`Blockchain transaction ${action} completion email sent to ${userEmail}`);
        } catch (emailError: unknown) {
          const emailErrorMessage =
            emailError instanceof Error ? emailError.message : 'Unknown error';
          this.logger.error(
            `Failed to send blockchain transaction completion email for property ${propertyId}: ${emailErrorMessage}`,
          );
        }
      }

      this.logger.log(`Successfully processed blockchain ${action} job for property ${propertyId}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.logger.error(`Blockchain job failed for property ${propertyId}: ${errorMessage}`);
      if (err instanceof Error && err.stack) {
        this.logger.error(`Error stack: ${err.stack}`);
      }

      throw err;
    }
  }
  async uploadAttachments(
    propertyId: number,
    files: Express.Multer.File[],
    currentUser: UserResponseDto,
    isPropertyPhoto: boolean,
  ): Promise<PropertyAttachment[]> {
    await this.checkPropertyPermission(propertyId, currentUser);

    if (!files?.length) {
      return [];
    }

    /**
     * 1️⃣ Upload files to S3 (cannot be transactional)
     */
    let uploadedFiles: { file: Express.Multer.File; filePath: string }[];

    try {
      uploadedFiles = await Promise.all(
        files.map(async (file) => ({
          file,
          filePath: await this.s3Service.uploadFile(file),
        })),
      );
    } catch (error) {
      this.logger.error('S3 upload failed', error);
      throw new BadRequestException('Failed to upload one or more files.');
    }

    /**
     * 2️⃣ Database transaction
     */
    return await this.prisma.$transaction(async (tx) => {
      /**
       * Create attachments
       */
      await tx.attachment.createMany({
        data: uploadedFiles.map(({ file, filePath }) => ({
          fileName: file.originalname,
          fileSize: file.size,
          fileType: file.mimetype,
          filePath,
          propertyId,
        })),
      });

      /**
       * Fetch created attachments
       * (createMany doesn't return rows)
       */
      const createdAttachments = await tx.attachment.findMany({
        where: {
          propertyId,
          filePath: {
            in: uploadedFiles.map((f) => f.filePath),
          },
        },
      });

      const uploadedAttachmentIds = createdAttachments.map((a) => a.id);

      /**
       * Update PropertyOtherInfo
       */
      if (uploadedAttachmentIds.length) {
        const data: any = {
          attachmentIds: { push: uploadedAttachmentIds },
        };

        if (isPropertyPhoto) {
          data.imageIds = { push: uploadedAttachmentIds };
        }

        await tx.propertyOtherInfo.update({
          where: { propertyRecordId: propertyId },
          data,
        });
      }

      /**
       * Log activity
       */
      await this.activityService.logActivity({
        action: ActivityActions.PROPERTY_ADD_ATTACHMENT,
        entityId: propertyId,
        entityType: ActivityEntityTypes.PROPERTY,
        description: 'Uploaded attachments to property.',
        metadata: createdAttachments.map((attachment) => ({
          name: attachment.fileName,
          propertyId,
          url: attachment.filePath,
        })),
      });
      if (!isPropertyPhoto) {
        await this.syncPropertyToBlockchain(propertyId, currentUser);
      }
      return createdAttachments;
    });
  }

  async getInvitedUsers(
    propertyId: number,
    query: { page?: number; limit?: number },
  ): Promise<PaginatedInvitedUsersResponseDto> {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) throw new NotFoundException(`Property ${propertyId} not found`);

    const grouped = await this.prisma.userInviteRole.groupBy({
      by: ['userInviteId'],
      where: {
        propertyId,
        status: 'PENDING',
      },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      skip,
      take: limit,
    });

    const userInviteIds = grouped.map((g) => g.userInviteId);

    if (userInviteIds.length === 0) {
      return new PaginatedInvitedUsersResponseDto({
        invitedUsers: [],
        totalCount: 0,
        hasMore: false,
      });
    }

    const inviteRoles = await this.prisma.userInviteRole.findMany({
      where: {
        propertyId,
        userInviteId: { in: userInviteIds },
        status: 'PENDING',
      },
      include: {
        userInvite: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const groupedUsers = inviteRoles.reduce<Record<string, PropertyInvitedUsersResponse>>(
      (acc, invite) => {
        const key = invite.userInvite.id;
        if (!acc[key]) {
          acc[key] = {
            id: invite.userInvite.id,
            email: invite.userInvite.email,
            roles: [],
            createdAt: invite.createdAt,
            status: invite.status,
          };
        }
        acc[key].roles.push(invite.role);
        return acc;
      },
      {},
    );

    const totalCount = await this.prisma.userInviteRole.groupBy({
      by: ['userInviteId'],
      where: {
        propertyId,
        status: 'PENDING',
      },
      _count: { userInviteId: true },
    });

    const total = totalCount.length;
    const hasMore = skip + limit < total;

    return new PaginatedInvitedUsersResponseDto({
      invitedUsers: Object.values(groupedUsers).sort((a, b) => {
        const aDate = a.createdAt ? a.createdAt.getTime() : 0;
        const bDate = b.createdAt ? b.createdAt.getTime() : 0;
        return bDate - aDate;
      }),
      totalCount: total,
      hasMore,
    });
  }

  async getPropertyUsers(
    propertyId: number,
    query: { page?: number; limit?: number },
  ): Promise<PaginatedPropertyUsersResponseDto> {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) throw new NotFoundException(`Property ${propertyId} not found`);

    const grouped = await this.prisma.propertyUser.groupBy({
      by: ['userId'],
      where: { propertyId },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      skip,
      take: limit,
    });

    const userIds = grouped.map((g) => g.userId);
    if (userIds.length === 0) {
      return new PaginatedPropertyUsersResponseDto({
        users: [],
        totalCount: 0,
        hasMore: false,
      });
    }

    const propertyUsers = await this.prisma.propertyUser.findMany({
      where: { propertyId, userId: { in: userIds } },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        userRole: { select: { role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const groupedUsers = propertyUsers.reduce<Record<number, PropertyUserResponseDto>>(
      (acc, record) => {
        const key = record.user.id;
        if (!acc[key]) {
          acc[key] = {
            id: record.user.id,
            email: record.user.email,
            fullName: record.user.fullName,
            roles: [],
            createdAt: record.createdAt,
          };
        }
        if (record.userRole.role && Object.values(Role).includes(record.userRole.role)) {
          acc[key].roles.push(record.userRole.role);
        }
        return acc;
      },
      {},
    );

    const totalCount = await this.prisma.propertyUser.groupBy({
      by: ['userId'],
      where: { propertyId },
      _count: { userId: true },
    });

    const total = totalCount.length;
    const hasMore = skip + limit < total;

    return new PaginatedPropertyUsersResponseDto({
      users: Object.values(groupedUsers).sort((a, b) => {
        const aDate = a.createdAt ? a.createdAt.getTime() : 0;
        const bDate = b.createdAt ? b.createdAt.getTime() : 0;
        return bDate - aDate;
      }),
      totalCount: total,
      hasMore,
    });
  }

  async getPropertyInvitedUsersAndActiveUsers(
    propertyId: number,
  ): Promise<PropertyAllUsersResponse[]> {
    // Fetch the latest invited roles per userInvite
    const grouped = await this.prisma.userInviteRole.groupBy({
      by: ['userInviteId'],
      where: { propertyId },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
    });
    const userInviteIds = grouped.map((g) => g.userInviteId);

    const propertyInvitedRoles = await this.prisma.userInviteRole.findMany({
      where: { propertyId, userInviteId: { in: userInviteIds } },
      include: { userInvite: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const propertyUsers = propertyInvitedRoles.map((pu) => ({
      id: pu.id,
      email: pu.userInvite.email,
      role: pu.role,
      status: pu.status,
      verified: true,
    }));

    return propertyUsers;
  }

  async deletePropertyUser(propertyId: number, userId: number, currentUserId: number) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, createdById: true, name: true },
    });

    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }

    if (property.createdById !== currentUserId) {
      throw new ForbiddenException('You are not authorized to remove users from this property');
    }

    const propertyUser = await this.prisma.propertyUser.findFirst({
      where: { propertyId, userId },
    });

    if (!propertyUser) {
      throw new NotFoundException(`User ${userId} is not associated with this property`);
    }

    await this.prisma.propertyUser.delete({
      where: { id: propertyUser.id },
    });

    // Send notification to the removed user
    try {
      const notificationData = this.notificationService.preparePropertyUserRemovedNotification({
        userId: userId,
        propertyId: propertyId,
        propertyName: property.name,
        removedBy: currentUserId,
      });
      await this.notificationQueueService.enqueueNotification(notificationData);
    } catch (notificationError) {
      // Log error but don't fail the operation
      this.logger.error(
        `Failed to queue notification for removed user ${userId} from property ${propertyId}:`,
        notificationError,
      );
    }

    return {
      message: `User ${userId} has been removed from property ${propertyId}`,
      deletedUserId: userId,
      propertyId,
    };
  }

  async generatePropertyReport(propertyId: number): Promise<Buffer> {
    this.logger.log(`Starting property report generation for property ${propertyId}`);

    try {
      // Fetch property with all necessary relations in a single query
      const property = await this.prisma.property.findUnique({
        where: { id: propertyId },
        include: {
          ownerInfo: true,
          otherInfo: true,
          propertyAddress: true,
          types: true,
          propertyUsers: { include: { user: true, userRole: true } },
          attachments: true,
          documents: true,
          createdBy: true,
          inviteRoles: true,
        },
      });

      if (!property) throw new NotFoundException('Property not found');

      // Fetch activity logs
      const allLogs = await this.activityService.getLogsByProperty(propertyId);
      const thirtyDaysAgo = dayjs().subtract(30, 'day');

      const filteredLogs: { date: string; entries: ActivityEntryForReport[] }[] = allLogs
        .map((group) => {
          const entries: ActivityEntryForReport[] = group.entries
            .filter((entry) => dayjs(entry.createdAt).isAfter(thirtyDaysAgo))
            .map((entry) => ({
              createdAt: entry.createdAt,
              userName: entry.user?.fullname ?? 'Unknown',
              description: entry.description ?? '',
            }));

          return { date: group.date, entries };
        })
        .filter((group) => group.entries.length > 0);

      // Get primary property image
      const propertyImageId = property.otherInfo?.imageIds?.[0];
      const propertyImage =
        property.attachments?.find((att) => att.id === propertyImageId)?.filePath ?? null;

      // Fetch the latest invited roles per userInvite
      const grouped = await this.prisma.userInviteRole.groupBy({
        by: ['userInviteId'],
        where: { propertyId },
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: 'desc' } },
      });
      const userInviteIds = grouped.map((g) => g.userInviteId);

      const propertyInvitedRoles = await this.prisma.userInviteRole.findMany({
        where: { propertyId, userInviteId: { in: userInviteIds } },
        include: { userInvite: { select: { id: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      });

      const propertyUsers = propertyInvitedRoles.map((pu) => ({
        email: pu.userInvite.email,
        role: UserRoleLabels[pu.role] || pu.role,
        status: PropertyUSerInviteStatusLabels[pu.status] || pu.status,
        verified: true,
      }));

      // Filter attachments based on allowed IDs
      const allowedIds = new Set(property.otherInfo?.attachmentIds ?? []);
      const attachments = property.attachments
        .filter((att) => allowedIds.has(att.id))
        .map((att) => ({
          type: att.fileType?.split('/')[1] ?? null,
          name: att.fileName,
          url: att.filePath,
        }));

      // Prepare template data
      const templateData = {
        report: {
          issueDate: dayjs().format('MM/DD/YYYY'),
          createdBy: property.createdBy?.fullName ?? 'N/A',
        },
        owner: {
          name: property.ownerInfo?.name,
          verified: true,
          phone: property.ownerInfo?.phoneNumber,
          email: property.ownerInfo?.email,
        },
        property: {
          title: property.name,
          description: property.otherInfo?.propertyDescription,
          address: property.propertyAddress?.formatedAddress,
          zoning: property.propertyAddress?.zipCode,
          assetType: property.types.map((t) => PropertyTypeLabels[t.type] || t.type).join(', '),
          squareFootage: property.otherInfo?.grossBuildingArea
            ? `${Number(property.otherInfo.grossBuildingArea).toFixed(2)} sq. ft`
            : '',
          imageUrl: propertyImage,
        },
        activity: {
          rows: this.splitLogsIntoColumns(filteredLogs),
        },
        fingerprintScore: property.completenessScore,
        attachments,
        users: propertyUsers,
      };

      const html = PropertyReportTemplates.report(templateData);
      const headerHtml = PropertyReportTemplates.header(templateData);
      const footerHtml = PropertyReportTemplates.footer(templateData);

      const browser = await getBrowser();
      this.logger.log('Browser launched successfully');

      const page = await browser.newPage();
      this.logger.log('New page created');

      try {
        await page.setContent(html, { waitUntil: 'networkidle0' });
        this.logger.log('HTML content set successfully');

        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: headerHtml,
          footerTemplate: footerHtml,
          preferCSSPageSize: false,
          margin: {
            top: '100px',
            bottom: '120px',
          },
        });
        this.logger.log('PDF generated successfully');

        return Buffer.from(pdfBuffer);
      } finally {
        await page.close();
      }
    } catch (error) {
      this.logger.error(
        `Failed to generate property report: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  splitLogsIntoColumns(filteredGroups: ActivityGroup[]): ActivityRow[] {
    const now = dayjs();
    const fifteenDaysAgo = now.subtract(15, 'day');
    const thirtyDaysAgo = now.subtract(30, 'day');

    const recent: typeof filteredGroups = [];
    const older: typeof filteredGroups = [];

    for (const group of filteredGroups) {
      const groupDate = dayjs(group.date, 'MMMM D, YYYY');

      if (groupDate.isAfter(fifteenDaysAgo)) {
        recent.push(group);
      } else if (groupDate.isAfter(thirtyDaysAgo)) {
        older.push(group);
      }
    }

    const formatGroups = (groups: typeof filteredGroups) =>
      groups.map((group) => ({
        date: dayjs(group.date).format('MMMM D, YYYY'),
        entries: group.entries.map((entry) => ({
          time: dayjs(entry.createdAt).format('h:mm A'),
          user: entry.userName,
          description: entry.description ?? '',
        })),
      }));

    const splitIntoTwoColumns = (groups: ReturnType<typeof formatGroups>) => {
      const midPoint = Math.ceil(groups.length / 2);
      const leftColumn = groups.slice(0, midPoint);
      const rightColumn = groups.slice(midPoint);

      return { leftColumn, rightColumn };
    };

    const buildRange = (from: dayjs.Dayjs, to: dayjs.Dayjs) =>
      `${from.format('MMM DD')} - ${to.format('MMM DD')}`;

    const formattedRecent = formatGroups(recent);
    const formattedOlder = formatGroups(older);

    const recentColumns = splitIntoTwoColumns(formattedRecent);
    const olderColumns = splitIntoTwoColumns(formattedOlder);

    return [
      {
        title: 'Recent Activity (Last 15 Days)',
        columns: [
          {
            data: recentColumns.leftColumn,
            dateRange: buildRange(fifteenDaysAgo, now),
          },
          {
            data: recentColumns.rightColumn,
            dateRange: buildRange(fifteenDaysAgo, now),
          },
        ],
      },
      {
        title: 'Previous Activity (Days 16-30)',
        columns: [
          {
            data: olderColumns.leftColumn,
            dateRange: buildRange(thirtyDaysAgo, fifteenDaysAgo.subtract(1, 'day')),
          },
          {
            data: olderColumns.rightColumn,
            dateRange: buildRange(thirtyDaysAgo, fifteenDaysAgo.subtract(1, 'day')),
          },
        ],
      },
    ];
  }

  async getUpdatedCompletenessScore(propertyId: number, minScore: number): Promise<number> {
    const existing = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { completenessScore: true },
    });

    const currentScore =
      existing?.completenessScore != null ? Number(existing.completenessScore) : 0;

    return Math.max(currentScore, minScore);
  }
}
