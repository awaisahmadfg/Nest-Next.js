import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { PropertyResponseDto } from './dto/property-response.dto';
import { InviteStatus, PropertyType } from '@prisma/client';
import { InvitationsService } from '../invitations/invitations.service';

@Injectable()
export class PropertyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitationsService: InvitationsService,
  ) {}

  async createPropertyAndInvite(
    createPropertyDto: CreatePropertyDto,
    createdById: number,
  ): Promise<PropertyResponseDto> {
    const { propertyId, propertyType, propertyName, address, invites } = createPropertyDto;

    if (!propertyId?.trim()) {
      throw new BadRequestException('propertyId is required');
    }

    const existing = await this.prisma.property.findUnique({ where: { propertyId } });
    if (existing) {
      throw new ConflictException(`Property with id ${propertyId} already exists`);
    }

    const property = await this.prisma.property.create({
      data: {
        propertyId,
        type: propertyType as PropertyType,
        name: propertyName,
        address,
        createdById,
      },
    });

    // Send invites (optional). We use business code (property.propertyId) for the URL UX.
    if (Array.isArray(invites) && invites.length > 0) {
      const tasks = invites.map((inv) =>
        this.invitationsService.sendEmailInvite({
          invitedById: createdById,
          email: inv.email,
          role: inv.role,
          propertyId: property.propertyId, // 👈 business code; service resolves to PK
        }),
      );

      // Do not fail property creation if an invite fails; just let it settle.
      await Promise.allSettled(tasks);
    }

    return plainToInstance(PropertyResponseDto, property, { excludeExtraneousValues: true });
  }

  // NEW METHOD: Get properties for a user (created by them or they're invited to)
  async getPropertiesForUser(userId: number): Promise<PropertyResponseDto[]> {
    const properties = await this.prisma.property.findMany({
      where: {
        OR: [
          // Properties created by the user
          { createdById: userId },
          // Properties where the user has been invited (and accepted)
          {
            invites: {
              some: {
                invitedUserId: userId,
                status: InviteStatus.ACCEPTED,
              },
            },
          },
        ],
      },
      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        invites: {
          where: {
            invitedUserId: userId,
            status: InviteStatus.ACCEPTED,
          },
          select: {
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return plainToInstance(PropertyResponseDto, properties, { excludeExtraneousValues: true });
  }
}
