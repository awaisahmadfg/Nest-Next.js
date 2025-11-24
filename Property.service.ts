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
import { PropertiesType, Role, Utilities, Prisma, PropertyStatus } from '@prisma/client';
import { UpdateFoundationalDataDto } from './dto/update-foundational-data.dto';
import { UpdateOtherInfoDto } from './dto/update-other-info.dto';
import { UpdateUtilitiesAttachmentsDto } from './dto/update-utilities-attachments.dto';
import { UpdateInvitationsDto } from './dto/update-invitations.dto';
import { UpdateOverviewDto } from './dto/update-overview.dto';
import { InvitationsService } from '../invitations/invitations.service';
import type { Attachment, AuthedReq } from 'src/common/types';
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
import { BLOCKCHAIN } from 'src/common/constants';
import { BlockchainService } from '../blockchain/blockchain.service';

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
  ) {}

  async createPropertyAndInvite(
    currentUser: AuthedReq['user'],
    createPropertyDto: CreatePropertyDto,
    documents?: Express.Multer.File[],
  ): Promise<{ property: PropertyResponseDto; message: string }> {
    const {
      propertyTypes,
      propertyName,
      address,
      city,
      state,
      zipCode,
      country,
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
      country ?? 'US',
      state ?? 'MA',
      city ?? 'CAMB',
      zipCode ?? '02139',
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
        address,
        city,
        state,
        zipCode,
        country,
        market,
        subMarket,
        secondaryType,
        yearBuilt,
        createdById: currentUser.id,
        attachments: { create: attachmentsData },
        types: {
          createMany: { data: propertyTypesData },
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
      include: { types: true, attachments: true, ownerInfo: true },
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
        location: property.address ?? null,
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
      property: plainToInstance(PropertyResponseDto, property, { excludeExtraneousValues: true }),
      message,
    };
  }

  async publishProperty(
    propertyRecordId: number,
    currentUser: AuthedReq['user'],
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

        const propertyRecord = await this.prisma.property.findUnique({
          where: { propertyId: property.propertyId },
          select: { id: true },
        });

        if (propertyRecord) {
          await this.activityService.logActivity({
            action: ActivityActions.PROPERTY_PUBLISH_BALANCE_ERROR,
            entityType: ActivityEntityTypes.PROPERTY,
            entityId: propertyRecord.id,
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

          const propertyRecord = await this.prisma.property.findUnique({
            where: { propertyId: property.propertyId },
            select: { id: true },
          });

          if (propertyRecord) {
            await this.activityService.logActivity({
              action: ActivityActions.PROPERTY_PUBLISH_BALANCE_ERROR,
              entityType: ActivityEntityTypes.PROPERTY,
              entityId: propertyRecord.id,
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
    user: AuthedReq['user'],
    query: GetPropertiesQueryDto,
  ): Promise<{
    properties: PropertyResponseDto[];
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

    // 🔍 Include relations
    const propertyInclude = {
      otherInfo: true,
      attachments: true,
      propertyUsers: {
        select: { userRole: true, userRoleId: true },
      },
      ownerInfo: true,
    };

    // 🧾 Query
    const properties = await this.prisma.property.findMany({
      where: whereClause,
      include: propertyInclude,
      orderBy: { id: 'desc' },
      take: limit + 1,
    });

    const hasMore = properties.length > limit;
    const resultProperties = hasMore ? properties.slice(0, limit) : properties;

    const nextCursor =
      resultProperties.length > 0
        ? resultProperties[resultProperties.length - 1].id.toString()
        : undefined;

    // 🧮 Transform numeric fields
    const transformedProperties = resultProperties.map((property) => ({
      ...property,
      otherInfo: property.otherInfo
        ? {
            ...property.otherInfo,
            landSize: property.otherInfo.landSize ? Number(property.otherInfo.landSize) : 0,
            grossBuildingArea: property.otherInfo.grossBuildingArea
              ? Number(property.otherInfo.grossBuildingArea)
              : 0,
          }
        : null,
    }));

    return {
      properties: plainToInstance(PropertyResponseDto, transformedProperties, {
        excludeExtraneousValues: true,
      }),
      hasMore,
      nextCursor: hasMore ? nextCursor : undefined,
    };
  }

  async getPropertyById(
    propertyRecordId: number,
    user: AuthedReq['user'],
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
      inviteRoles: {
        where: {
          propertyId: propertyRecordId,
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

  async bulkCreateProperties(
    user: AuthedReq['user'],
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
        // 2️⃣ Insert properties
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

        // 4️⃣ Prepare data for `PropertyTypeOnProperty` join table and `PropertyOwnerInfo`
        const propertyTypes: Prisma.PropertyTypeOnPropertyCreateManyInput[] = [];
        const ownerInfos: Prisma.PropertyOwnerInfoCreateManyInput[] = [];

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

        // 7️⃣ Return structured response
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
    currentUser: AuthedReq['user'],
  ): Promise<void> {
    // Check if property exists and user has permission
    await this.checkPropertyPermission(propertyRecordId, currentUser);

    const {
      propertyName,
      address,
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
      city,
      state,
      zipCode,
      country,
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
        address,
        secondaryType,
        buildingClass,
        occupancyType,
        market,
        subMarket,
        city,
        state,
        zipCode,
        country,
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
        dealStructure: 'For_Sale', // Default value
        landSize: 0,
        grossBuildingArea: 0,
        use: 'Current', // Default value
        parcelId_or_apn: 0,
        safety: new Date(),
        leaseStatus: 'Active', // Default value
        legalPropertyAddress: address,
        lastSaleDate: new Date(),
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
    currentUser: AuthedReq['user'],
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

    // Update property basic info
    await this.prisma.property.update({
      where: { id: propertyRecordId },
      data: {
        yearBuilt,
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
    currentUser: AuthedReq['user'],
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
    currentUser: AuthedReq['user'],
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
    currentUser: AuthedReq['user'],
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
    currentUser: AuthedReq['user'],
  ): Promise<void> {
    // Check property permission first
    await this.checkPropertyPermission(propertyRecordId, currentUser);

    // Find the attachment
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        propertyId: propertyRecordId,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    try {
      // Delete from S3 first
      await this.s3Service.deleteFile(attachment.filePath);
    } catch (error) {
      this.logger.warn(`Failed to delete file from S3: ${attachment.filePath}`, error);
      // Continue with database deletion even if S3 deletion fails
    }

    // Delete from database
    await this.prisma.attachment.delete({
      where: {
        id: attachmentId,
      },
    });

    const propertyOtherInfo = await this.prisma.propertyOtherInfo.findUnique({
      where: { propertyRecordId },
    });

    if (propertyOtherInfo) {
      const isImage = attachment.fileType.startsWith('image/');
      const updateData: { attachmentIds?: number[]; imageIds?: number[] } = {};

      if (Array.isArray(propertyOtherInfo.attachmentIds)) {
        const attachmentIds: number[] = propertyOtherInfo.attachmentIds;
        const updatedAttachmentIds = attachmentIds.filter((id) => id !== attachmentId);
        updateData.attachmentIds = updatedAttachmentIds;
      }

      if (isImage && Array.isArray(propertyOtherInfo.imageIds)) {
        const imageIds: number[] = propertyOtherInfo.imageIds;
        const updatedImageIds = imageIds.filter((id) => id !== attachmentId);
        updateData.imageIds = updatedImageIds;
      }

      if (Object.keys(updateData).length > 0) {
        await this.prisma.propertyOtherInfo.update({
          where: { propertyRecordId },
          data: updateData,
        });
      }
    }

    await this.activityService.logActivity({
      action: ActivityActions.PROPERTY_REMOVE_ATTACHMENT,
      entityId: propertyRecordId ?? undefined,
      entityType: ActivityEntityTypes.PROPERTY,
      description: `Remove document form property.`,
      metadata: {
        name: attachment.fileName,
        propertyId: propertyRecordId,
        url: attachment.filePath,
        id: attachment.id,
      },
    });

    this.logger.log(
      `Attachment ${attachmentId} deleted successfully for property ${propertyRecordId}`,
    );
  }

  async updateOverview(
    propertyId: number,
    updateData: UpdateOverviewDto,
    currentUser: AuthedReq['user'],
  ): Promise<void> {
    await this.checkPropertyPermission(propertyId, currentUser);

    const {
      propertyName,
      address,
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
      city,
      state,
      zipCode,
      country,
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
          address,
          secondaryType,
          buildingClass,
          occupancyType,
          market,
          subMarket,
          city,
          state,
          zipCode,
          country,
          yearBuilt,
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
    currentUser: AuthedReq['user'],
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

        const propertyRecord = await this.prisma.property.findUnique({
          where: { propertyId: property.propertyId },
          select: { id: true },
        });

        if (propertyRecord) {
          await this.activityService.logActivity({
            action: ActivityActions.PROPERTY_SYNC_BALANCE_ERROR,
            entityType: ActivityEntityTypes.PROPERTY,
            entityId: propertyRecord.id,
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

      const dummyCID = 'QmYjtig7VJQ6XsnUjqqJvj7QaMcCAwtrgNdahSiFofrE7o';
      const dummyTokenId = 1;

      this.logger.log(
        `Estimating gas cost for update with dummy CID: ${dummyCID} and dummy tokenId: ${dummyTokenId}`,
      );

      const estimate = await this.blockchainService.estimateUpdatePropertyCost(
        dummyTokenId,
        dummyCID,
      );
      const estimatedCostWei = estimate.totalCostWei;
      this.logger.log(
        `Estimated gas cost for update: ${estimate.totalCostEth} POL (${estimatedCostWei.toString()} wei)`,
      );

      // Compare balance with estimated cost
      const balanceWeiBigInt = BigInt(Math.floor(balanceWei * 1e18)); // Convert POL to wei
      if (balanceWeiBigInt < estimatedCostWei) {
        const estimatedCostEth = (Number(estimatedCostWei) / 1e18).toFixed(6);
        this.logger.warn(
          `Insufficient balance: ${balanceEth} POL < estimated cost: ${estimatedCostEth} POL`,
        );
        const errorMessage = `Insufficient balance in wallet. Current balance: ${balanceEth} POL. Estimated transaction cost: ${estimatedCostEth} POL. Please add funds to complete the transaction.`;

        const propertyRecord = await this.prisma.property.findUnique({
          where: { propertyId: property.propertyId },
          select: { id: true },
        });

        if (propertyRecord) {
          await this.activityService.logActivity({
            action: ActivityActions.PROPERTY_SYNC_BALANCE_ERROR,
            entityType: ActivityEntityTypes.PROPERTY,
            entityId: propertyRecord.id,
            description: errorMessage,
            metadata: {
              propertyId: property.propertyId,
              balance: balanceEth,
              estimatedCost: estimatedCostEth,
              errorType: 'insufficient_balance',
            },
          });
        }

        throw new BadRequestException(errorMessage);
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
        select: { tokenId: true, status: true },
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

      await this.prisma.property.update({
        where: { propertyId: propertyId },
        data: {
          tokenId: result.data.tokenId,
          transactionHash: result.data.transactionHash,
          documentsCID: result.data.metadataCID,
          status: PropertyStatus.APPROVED,
        },
      });

      const propertyRecord = await this.prisma.property.findUnique({
        where: { propertyId },
        select: { id: true },
      });

      if (!propertyRecord) {
        this.logger.error(`Property record not found for propertyId: ${propertyId}`);
        throw new Error(`Property record not found for propertyId: ${propertyId}`);
      }

      // Send email notification only for 'register' action (not for 'update' from sync-blockchain)
      if (action === 'register') {
        try {
          const actionUrl = `${process.env.WEBSITE_URL}/properties/${propertyRecord.id}/add-info`;

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
    currentUser: AuthedReq['user'],
  ): Promise<Attachment[]> {
    await this.checkPropertyPermission(propertyId, currentUser);

    const uploadedAttachments: Attachment[] = [];

    for (const file of files) {
      try {
        // Upload file to S3
        const fileUrl = await this.s3Service.uploadFile(file);

        // Save attachment record to database
        const attachment = await this.prisma.attachment.create({
          data: {
            fileName: file.originalname,
            fileSize: file.size,
            fileType: file.mimetype,
            filePath: fileUrl,
            propertyId: propertyId,
          },
        });

        uploadedAttachments.push(attachment);
        this.logger.log(
          `Attachment uploaded successfully: ${file.originalname} for property ${propertyId}`,
        );
      } catch (error) {
        this.logger.error(`Failed to upload attachment ${file.originalname}:`, error);
        throw new BadRequestException(`Failed to upload file: ${file.originalname}`);
      }
    }
    await this.activityService.logActivity({
      action: ActivityActions.PROPERTY_REMOVE_ATTACHMENT,
      entityId: propertyId ?? undefined,
      entityType: ActivityEntityTypes.PROPERTY,
      description: `Upload attachments to property.`,
      metadata: uploadedAttachments.map((attachment) => ({
        name: attachment.fileName,
        propertyId: propertyId,
        url: attachment.filePath,
      })),
    });
    return uploadedAttachments;
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
      where: { propertyId },
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
      where: { propertyId, userInviteId: { in: userInviteIds } },
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
      where: { propertyId },
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

  async deletePropertyUser(propertyId: number, userId: number, currentUserId: number) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, createdById: true },
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

    return {
      message: `User ${userId} has been removed from property ${propertyId}`,
      deletedUserId: userId,
      propertyId,
    };
  }
}
