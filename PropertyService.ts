/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
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
import { InvitationsService } from '../invitations/invitations.service';
import type { Attachment, AuthedReq } from 'src/common/types';
import { S3Service } from '../file-upload/s3.service';
import { BulkCreatePropertyDto } from './dto/bulk-create-property.dto';
import { generatePropertyId } from 'src/common/helpers';
import { PinataService } from '../pinata/pinata.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { ethers } from 'ethers';
import { BlockchainQueueService } from '../queue/blockchain-queue.service';

function isValidUtility(utility: string): utility is Utilities {
  return ['Power', 'Internet', 'Electricity', 'Phone'].includes(utility);
}

@Injectable()
export class PropertyService {
  private readonly logger = new Logger(PropertyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invitationsService: InvitationsService,
    private readonly s3Service: S3Service,
    private readonly pinataService: PinataService,
    private readonly blockchainService: BlockchainService,
    private readonly blockchainQueueService: BlockchainQueueService,
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

    // Early blockchain balance check - BEFORE any operations (S3 upload, property creation, etc.)
    if (documents && documents.length > 0) {
      try {
        // Check if we have sufficient balance for blockchain transaction
        // We'll use a dummy CID for estimation since we need to check balance early
        const dummyCID = 'QmSpVG2mvzwRyRBk8sMHYTNmNf7rQzxTtgcWY6oC8Kj9WB'; // Use a known valid CID for estimation
        this.logger.log(`Performing early balance check before any operations for ${propertyId}`);

        const [balanceEth, estimate] = await Promise.all([
          this.blockchainService.getWalletBalanceEth(),
          this.blockchainService.estimateRegisterLandCost(dummyCID),
        ]);

        const balanceWei = ethers.parseEther(balanceEth);
        if (balanceWei < estimate.totalCostWei) {
          this.logger.warn(
            `Insufficient wallet balance detected early. Balance: ${balanceEth} ETH, Required ~${estimate.totalCostEth} ETH. Aborting all operations for ${propertyId}`,
          );
          throw new BadRequestException(
            `Insufficient balance in wallet ${this.blockchainService['wallet'].address}. Current balance: ${balanceEth} ETH. Please add funds to complete the transaction.`,
          );
        }

        this.logger.log(
          `Balance check passed. Proceeding with S3 upload and property creation for ${propertyId}`,
        );
      } catch (balanceError: unknown) {
        // If it's a BadRequestException (insufficient balance), throw it
        if (balanceError instanceof BadRequestException) {
          throw balanceError;
        }

        // For other errors, log but continue (might be network issues)
        const errorMessage = balanceError instanceof Error ? balanceError.message : 'Unknown error';
        this.logger.warn(
          `Early balance check failed for ${propertyId}: ${errorMessage}. Continuing with property creation.`,
        );
      }
    }

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

    // Add current user to PropertyUser if not SUPER_ADMIN
    if (currentUser && currentUser.selectedRole !== Role.SUPER_ADMIN) {
      const userRole = await this.prisma.userRole.findFirst({
        where: {
          userId: currentUser.id,
          role: currentUser.selectedRole,
        },
      });

      await this.prisma.propertyUser.create({
        data: {
          propertyId: property.id,
          userId: currentUser.id,
          userRoleId: userRole?.id as number,
        },
      });
    }

    // Upload attachments to Pinata/IPFS if any exist
    let metadataCID: string | null = null;
    if (attachmentsData && attachmentsData.length > 0) {
      try {
        this.logger.log(
          `Starting Pinata upload for property ${property.propertyId} with ${attachmentsData.length} files`,
        );

        const fileUrls = attachmentsData.map((attachment) => attachment.filePath);

        // Use the existing uploadS3Files method from PinataService
        const result = await this.pinataService.uploadS3Files({
          propertyId: property.propertyId,
          fileUrls: fileUrls,
        });

        metadataCID = result.metadataCID || null;
        this.logger.log(
          `Pinata upload completed for property ${property.propertyId}: ${result.message}`,
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to upload files to Pinata for property ${property.propertyId}: ${errorMessage}`,
        );
        // Don't throw the error - property creation should still succeed even if Pinata upload fails
      }
    }

    // Queue blockchain registration job
    let blockchainNote = '';
    if (metadataCID) {
      this.logger.log(
        `Queuing blockchain registration for property ${property.propertyId} with CID: ${metadataCID}`,
      );

      try {
        // Preflight: estimate gas cost and ensure wallet balance is sufficient
        const [balanceEth, estimate] = await Promise.all([
          this.blockchainService.getWalletBalanceEth(),
          this.blockchainService.estimateRegisterLandCost(metadataCID),
        ]);

        const balanceWei = ethers.parseEther(balanceEth);
        if (balanceWei < estimate.totalCostWei) {
          this.logger.warn(
            `Insufficient wallet balance. Balance: ${balanceEth} ETH, Required ~${estimate.totalCostEth} ETH. Skipping blockchain queue for ${property.propertyId}`,
          );
          // Append a note for frontend visibility without failing the flow
          blockchainNote = ' (blockchain registration pending: insufficient gas balance)';
        } else {
          const userDetails = await this.prisma.user.findUnique({
            where: { id: currentUser.id },
            select: { email: true, fullName: true },
          });

          if (userDetails?.email) {
            await this.blockchainQueueService.addBlockchainRegistrationJob({
              propertyId: property.propertyId,
              propertyName: property.name,
              metadataCID,
              userId: currentUser.id,
              userEmail: userDetails.email,
              userFullName: userDetails.fullName,
            });
          } else {
            this.logger.warn(
              `User ${currentUser.id} email not found, skipping blockchain registration job for property ${property.propertyId}`,
            );
          }
        }
      } catch (queueError: unknown) {
        const queueErrorMessage =
          queueError instanceof Error ? queueError.message : 'Unknown error';
        this.logger.error(
          `Failed to queue blockchain registration job for property ${property.propertyId}: ${queueErrorMessage}`,
        );

        // If it's a BadRequestException (insufficient balance), return it to frontend
        if (queueError instanceof BadRequestException) {
          throw queueError;
        }

        // For other errors, append a note but don't fail the flow
        blockchainNote = blockchainNote || ' (blockchain registration pending: queue error)';
      }
    }

    // Send invites
    if (Array.isArray(invites) && invites.length > 0) {
      const tasks = invites.map((inv) =>
        this.invitationsService.sendEmailToInvite({
          invitedById: currentUser.id,
          email: inv.email,
          roles: inv.roles,
          propertyId: property.propertyId,
        }),
      );
      await Promise.allSettled(tasks);
    }

    let message = 'Property created successfully';
    if (invites && invites.length > 0) {
      message += ' and invitations sent';
    }
    if (blockchainNote) {
      message += blockchainNote;
    }

    return {
      property: plainToInstance(PropertyResponseDto, property, { excludeExtraneousValues: true }),
      message,
    };
  }

  async getProperties(
    user: AuthedReq['user'],
    options?: {
      cursor?: string;
      limit?: number;
      status?: PropertyStatus[];
    },
  ): Promise<{
    properties: PropertyResponseDto[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    const { id: userId, selectedRole } = user;
    const { cursor, limit = 9, status = [] } = options || {};

    // ✅ Validate cursor
    const validCursor =
      cursor && cursor.trim() && !isNaN(parseInt(cursor, 10)) ? parseInt(cursor, 10) : undefined;

    const propertyInclude = {
      otherInfo: true,
      attachments: true,
      propertyUsers: {
        select: {
          userRole: true,
          userRoleId: true,
        },
      },
      ownerInfo: true, // PropertyOwnerInfo
    };

    // ✅ Build dynamic where clause
    const whereClause: any = {};

    if (status.length > 0) {
      whereClause.status = { in: status };
    }

    if (validCursor) {
      whereClause.id = { lt: validCursor };
    }

    if (selectedRole !== Role.SUPER_ADMIN && selectedRole !== Role.ADMIN) {
      whereClause.propertyUsers = {
        some: {
          userId,
          userRole: {
            role: { equals: selectedRole },
          },
        },
      };
    }

    // ✅ Fetch paginated properties
    const properties = await this.prisma.property.findMany({
      where: whereClause,
      include: propertyInclude,
      orderBy: { id: 'desc' },
      take: limit + 1,
    });

    // ✅ Handle pagination
    const hasMore = properties.length > limit;
    const resultProperties = hasMore ? properties.slice(0, limit) : properties;

    const nextCursor =
      resultProperties.length > 0
        ? resultProperties[resultProperties.length - 1].id.toString()
        : undefined;

    // ✅ Transform numeric fields
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
    propertyRecordId: string,
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
      invites: {
        select: {
          id: true,
          email: true,
          roles: true,
          status: true,
          createdAt: true,
        },
      },
    };

    let property;
    if (selectedRole === Role.SUPER_ADMIN || selectedRole === Role.ADMIN) {
      // Super admin can access any property
      property = await this.prisma.property.findUnique({
        where: { propertyId: propertyRecordId },
        include: propertyInclude,
      });
    } else {
      // Regular users can only access properties they have access to
      property = await this.prisma.property.findFirst({
        where: {
          propertyId: propertyRecordId,
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
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        imageLinks: '',
        attachmentLinks: '',
      },
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

      // Create attachments
      await this.prisma.attachment.createMany({
        data: attachmentsData.map((attachment) => ({
          ...attachment,
          propertyId: propertyRecordId,
        })),
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

      // Create attachments
      await this.prisma.attachment.createMany({
        data: attachmentsData.map((attachment) => ({
          ...attachment,
          propertyId: propertyRecordId,
        })),
      });
    }
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
          this.invitationsService.sendEmailToInvite({
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
}
