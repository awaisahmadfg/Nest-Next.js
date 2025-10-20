import { ConflictException, Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { RoleResponseDto } from './dto/roles-response.dto';
import {
  Prisma,
  Role,
  RoleStatus,
  User,
  UserProfileStatus,
  UserRole as PrismaUserRole,
  UserRole,
  InviteStatus,
} from '@prisma/client';
import { ERROR_MESSAGES } from '../../common/constants';
import { formatRole } from '../../common/helpers';
import * as bcrypt from 'bcryptjs';
import { Profile, ProfilePromise } from './interfaces/profile.interface';
import { NotFoundException } from '@nestjs/common';
import { AdditionalInfoDto, DetailedProfileDto, RoleProfileDto } from './dto/detailed-profile.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { BulkUpdateUserRolesDto } from './dto/bulk-update-user-roles.dto';
import { ProfileWithAdditionalInfo, ProfileWithUserRole } from './types/additional-info.types';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtService } from '@nestjs/jwt';
import { FindUsersQueryDto } from './dto/find-users-query.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
  ) {}

  async createUser(createUserDto: CreateUserDto, assignedById?: number): Promise<UserResponseDto> {
    const { email, roles, isInvited, password, fullName, inviteId } = createUserDto;
    const hashedPassword = await bcrypt.hash(password, 10);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException(ERROR_MESSAGES.EMAIL_EXISTS_ERROR);

    const finalRoles: Role[] = roles?.length ? roles : [];

    return this.prisma.$transaction(async (prisma) => {
      // Step 1: Create the user
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          fullName,
          isInvited: isInvited || false,
          refreshToken: null,
          refreshTokenExpires: null,
        },
      });

      // Step 2: Create user roles individually to get IDs
      const createdRoles = await Promise.all(
        finalRoles.map((role) =>
          prisma.userRole.create({
            data: {
              userId: user.id,
              role,
              status: RoleStatus.PENDING,
              assignedAt: new Date(),
              assignedBy: isInvited ? assignedById : user.id,
            },
          }),
        ),
      );

      // Step 3: Handle invite and assign property roles
      if (isInvited && inviteId) {
        const existingInvite = await prisma.userInvite.findUnique({
          where: { id: parseInt(inviteId) },
          include: {
            invitedRoles: true,
          },
        });
        if (!existingInvite)
          throw new NotFoundException(`Invite with ID ${inviteId} does not exist`);

        // Update all invited roles to ACCEPTED status
        await prisma.userInviteRole.updateMany({
          where: { userInviteId: existingInvite.id },
          data: {
            status: InviteStatus.ACCEPTED,
            acceptedAt: new Date(),
          },
        });

        // Create property user associations for each invited role
        if (existingInvite.invitedRoles.length && createdRoles.length) {
          const propertyUserData = existingInvite.invitedRoles
            .filter((invitedRole) => invitedRole.propertyId)
            .map((invitedRole) => {
              const matchingCreatedRole = createdRoles.find(
                (createdRole) => createdRole.role === invitedRole.role,
              );
              return matchingCreatedRole
                ? {
                    propertyId: invitedRole.propertyId!,
                    userId: user.id,
                    userRoleId: matchingCreatedRole.id,
                  }
                : null;
            })
            .filter((data): data is NonNullable<typeof data> => data !== null);

          if (propertyUserData.length > 0) {
            await prisma.propertyUser.createMany({
              data: propertyUserData,
              skipDuplicates: true,
            });
          }
        }
      }

      // Step 4: Create profiles for roles
      if (createdRoles.length) {
        await this.createProfilesForRoles(prisma, createdRoles);
      }

      // Step 5: Fetch full user with roles for response
      const userWithRoles = await prisma.user.findUnique({
        where: { id: user.id },
        include: { userRoles: true, lastUsedRole: true },
      });
      if (!userWithRoles) throw new Error('User creation failed');

      const userRoles = userWithRoles.userRoles.map((ur) => ur.role);

      return new UserResponseDto({
        id: userWithRoles.id,
        email: userWithRoles.email,
        fullName: userWithRoles.fullName,
        roles: userRoles,
        onboardingProgress: userWithRoles.onboardingProgress,
        createdAt: userWithRoles.createdAt,
        updatedAt: userWithRoles.updatedAt,
        selectedRole: userWithRoles.lastUsedRole?.role ?? userRoles[0],
      });
    });
  }

  private async createProfilesForRoles(
    prisma: Prisma.TransactionClient,
    userRoles: PrismaUserRole[],
  ): Promise<void> {
    const profileCreationPromises: Promise<Profile>[] = [];

    for (const userRole of userRoles) {
      const promise = this.createProfilePromise(prisma, userRole.role, userRole.id);
      if (promise) {
        profileCreationPromises.push(promise);
      }
    }

    await Promise.all(profileCreationPromises);
  }

  private createProfilePromise(
    prisma: Prisma.TransactionClient,
    role: Role,
    userRoleId: number,
  ): ProfilePromise {
    switch (role) {
      case Role.DEVELOPER:
        return prisma.developerProfile.create({ data: { userRoleId } });
      case Role.BROKER:
        return prisma.brokerProfile.create({ data: { userRoleId } });
      case Role.ASSET_MANAGER:
        return prisma.assetManagerProfile.create({ data: { userRoleId } });
      case Role.PROPERTY_OWNER:
        return prisma.propertyOwnerProfile.create({ data: { userRoleId } });
      case Role.LENDER:
        return prisma.lenderProfile.create({ data: { userRoleId } });
      case Role.INVESTOR:
        return prisma.investorProfile.create({ data: { userRoleId } });
      case Role.ASSESSOR:
        return prisma.assessorProfile.create({ data: { userRoleId } });
      case Role.APPRAISER:
        return prisma.appraiserProfile.create({ data: { userRoleId } });
      case Role.INSURANCE_REP:
        return prisma.insuranceRepProfile.create({ data: { userRoleId } });
      default:
        return null;
    }
  }

  async findAll(query: FindUsersQueryDto): Promise<UserResponseDto[]> {
    const { roles, status, fromDate, toDate }: FindUsersQueryDto = query;

    const where: Prisma.UserWhereInput = {};

    // Roles filter
    if (roles?.length) {
      where.userRoles = {
        some: {
          role: { in: roles },
        },
      };
    }

    // Status filter
    if (status?.length) {
      where.profileStatus = { in: status };
    }

    // Date range filter (createdAt)
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    const users = await this.prisma.user.findMany({
      where,
      include: { userRoles: true },
      orderBy: { createdAt: 'desc' },
    });

    return users.map(
      (user) =>
        new UserResponseDto({
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roles: user.userRoles.map((ur) => ur.role),
          profileStatus: user.profileStatus,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }),
    );
  }

  async findUsersByStatus(status: RoleStatus | 'all'): Promise<UserResponseDto[]> {
    const allowedStatuses: RoleStatus[] = [
      'PENDING',
      'ADDITIONAL_INFO_REQUESTED',
      'ADDITIONAL_INFO_SUBMITTED',
    ];

    const users = await this.prisma.user.findMany({
      where:
        status === 'all'
          ? {
              // Fetch users who have at least one role with allowed statuses
              userRoles: {
                some: {
                  status: { in: allowedStatuses },
                },
              },
            }
          : {
              userRoles: {
                some: {
                  status,
                },
              },
            },
      include: {
        userRoles: true,
      },
    });

    return users
      .filter((user) =>
        status === 'all'
          ? // Keep only users whose *every* role has an allowed status
            user.userRoles.every((ur) => allowedStatuses.includes(ur.status))
          : true,
      )
      .map(
        (user) =>
          new UserResponseDto({
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            roles:
              status === 'all'
                ? user.userRoles.map((ur) => ur.role)
                : user.userRoles.filter((ur) => ur.status === status).map((ur) => ur.role),
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          }),
      );
  }

  async findUserByEmail(email: string): Promise<(User & { userRoles: PrismaUserRole[] }) | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: true,
      },
    });
  }

  async findUserResponseByEmail(email: string): Promise<UserResponseDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: true, // Include the userRoles to get the roles
        lastUsedRole: true,
      },
    });

    if (!user) {
      return null;
    }

    // Convert the Prisma user to UserResponseDto format

    const userRoles = user.userRoles.map((ur) => ur.role);
    const userResponse = new UserResponseDto({
      id: user.id,
      email: user.email,
      fullName: user.fullName || undefined,

      roles: userRoles,
      onboardingProgress: user.onboardingProgress,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,

      selectedRole: user.lastUsedRole?.role ?? userRoles[0],
    });

    return userResponse;
  }

  async findUserById(id: number): Promise<
    | (User & {
        userRoles: (PrismaUserRole & {
          brokerProfile?: { companyName?: string | null } | null;
          assetManagerProfile?: { companyName?: string | null } | null;
          propertyOwnerProfile?: { companyName?: string | null } | null;
          developerProfile?: { companyName?: string | null } | null;
          lenderProfile?: { companyName?: string | null } | null;
          investorProfile?: { companyName?: string | null } | null;
          assessorProfile?: { companyName?: string | null } | null;
          appraiserProfile?: { companyName?: string | null } | null;
          insuranceRepProfile?: { [key: string]: unknown } | null;
        })[];
        lastUsedRole: PrismaUserRole | null;
      })
    | null
  > {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: {
            brokerProfile: true,
            assetManagerProfile: true,
            propertyOwnerProfile: true,
            developerProfile: true,
            lenderProfile: true,
            investorProfile: true,
            assessorProfile: true,
            appraiserProfile: true,
            insuranceRepProfile: true,
          },
        },
        lastUsedRole: true,
      },
    });
  }
  async findDetailedProfileById(
    id: number,
    roleStatus?: RoleStatus[],
  ): Promise<DetailedProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
      include: {
        userRoles: {
          include: {
            brokerProfile: {
              include: {
                additionalInfo: true,
              },
            },
            assetManagerProfile: {
              include: {
                additionalInfo: true,
              },
            },
            propertyOwnerProfile: {
              include: {
                additionalInfo: true,
              },
            },
            developerProfile: {
              include: {
                additionalInfo: true,
              },
            },
            lenderProfile: {
              include: {
                additionalInfo: true,
              },
            },
            investorProfile: {
              include: {
                additionalInfo: true,
              },
            },
            assessorProfile: {
              include: {
                additionalInfo: true,
              },
            },
            appraiserProfile: {
              include: {
                additionalInfo: true,
              },
            },
            insuranceRepProfile: {
              include: {
                additionalInfo: true,
              },
            },
          },
        },
      },
    });

    // Filter roles based on the provided roleStatus parameter
    const filteredRoles = user?.userRoles.filter((userRole) => {
      if (roleStatus && roleStatus.length > 0) {
        return roleStatus.includes(userRole.status);
      }
      // If no roleStatus specified, return all roles (default behavior)
      return true;
    });

    // Build roles object with profile data - include roles based on the filter
    const roles: Partial<Record<Role, RoleProfileDto>> = {};

    // Fill in the roles based on the filtering criteria
    filteredRoles?.forEach((userRole) => {
      let profileData: RoleProfileDto | null = null;

      // Add denyReason only when status is REJECTED and denyReason exists
      const denyReasonProps =
        userRole.status === RoleStatus.REJECTED && userRole.denyReason
          ? { denyReason: userRole.denyReason }
          : {};

      if (userRole.brokerProfile) {
        profileData = new RoleProfileDto({
          id: userRole.brokerProfile.id,
          licenseNumber: userRole.brokerProfile.licenseNumber || undefined,
          professionalAssociationId: userRole.brokerProfile.professionalAssociationId || undefined,
          companyName: userRole.brokerProfile.companyName || undefined,
          primaryMarket: userRole.brokerProfile.primaryMarket || undefined,
          professionalExperience: userRole.brokerProfile.professionalExperience || undefined,
          specializationTypeId: userRole.brokerProfile.specializationTypeId || undefined,
          attachmentsLink: userRole.brokerProfile.attachmentsLink,
          status: userRole.status,
          additionalInfo: userRole.brokerProfile.additionalInfo
            ? new AdditionalInfoDto({
                note: userRole.brokerProfile.additionalInfo.note,
                userReply: userRole.brokerProfile.additionalInfo.userReply,
                attachmentsLink: userRole.brokerProfile.additionalInfo.attachmentsLink,
              })
            : null,
          ...denyReasonProps,
        });
      } else if (userRole.assetManagerProfile) {
        profileData = new RoleProfileDto({
          id: userRole.assetManagerProfile.id,
          companyName: userRole.assetManagerProfile.companyName || undefined,
          noOfPropertiesManaged: userRole.assetManagerProfile.noOfPropertiesManaged || undefined,
          primaryMarket: userRole.assetManagerProfile.primaryMarket || undefined,
          propertyTypeId: userRole.assetManagerProfile.propertyTypeId || undefined,
          attachmentsLink: userRole.assetManagerProfile.attachmentsLink,
          status: userRole.status,
          additionalInfo: userRole.assetManagerProfile.additionalInfo
            ? new AdditionalInfoDto({
                note: userRole.assetManagerProfile.additionalInfo.note,
                userReply: userRole.assetManagerProfile.additionalInfo.userReply,
                attachmentsLink: userRole.assetManagerProfile.additionalInfo.attachmentsLink,
              })
            : null,
          ...denyReasonProps,
        });
      } else if (userRole.propertyOwnerProfile) {
        profileData = new RoleProfileDto({
          id: userRole.propertyOwnerProfile.id,
          licenseNumber: userRole.propertyOwnerProfile.licenseNumber || undefined,
          companyName: userRole.propertyOwnerProfile.companyName || undefined,
          primaryMarket: userRole.propertyOwnerProfile.primaryMarket || undefined,
          registrationNumber: userRole.propertyOwnerProfile.registrationNumber || undefined,
          attachmentsLink: userRole.propertyOwnerProfile.attachmentsLink,
          status: userRole.status,
          additionalInfo: userRole.propertyOwnerProfile.additionalInfo
            ? new AdditionalInfoDto({
                note: userRole.propertyOwnerProfile.additionalInfo.note,
                userReply: userRole.propertyOwnerProfile.additionalInfo.userReply,
                attachmentsLink: userRole.propertyOwnerProfile.additionalInfo.attachmentsLink,
              })
            : null,
          ...denyReasonProps,
        });
      } else if (userRole.developerProfile) {
        profileData = new RoleProfileDto({
          id: userRole.developerProfile.id,
          licenseNumber: userRole.developerProfile.licenseNumber || undefined,
          companyName: userRole.developerProfile.companyName || undefined,
          primaryMarket: userRole.developerProfile.primaryMarket || undefined,
          constructionCategoryId: userRole.developerProfile.constructionCategoryId || undefined,
          attachmentsLink: userRole.developerProfile.attachmentsLink,
          status: userRole.status,
          additionalInfo: userRole.developerProfile.additionalInfo
            ? new AdditionalInfoDto({
                note: userRole.developerProfile.additionalInfo.note,
                userReply: userRole.developerProfile.additionalInfo.userReply,
                attachmentsLink: userRole.developerProfile.additionalInfo.attachmentsLink,
              })
            : null,
          ...denyReasonProps,
        });
      } else if (userRole.lenderProfile) {
        profileData = new RoleProfileDto({
          id: userRole.lenderProfile.id,
          licenseNumber: userRole.lenderProfile.licenseNumber || undefined,
          companyName: userRole.lenderProfile.companyName || undefined,
          investmentInterestId: userRole.lenderProfile.investmentInterestId || undefined,
          attachmentsLink: userRole.lenderProfile.attachmentsLink,
          status: userRole.status,
          additionalInfo: userRole.lenderProfile.additionalInfo
            ? new AdditionalInfoDto({
                note: userRole.lenderProfile.additionalInfo.note,
                userReply: userRole.lenderProfile.additionalInfo.userReply,
                attachmentsLink: userRole.lenderProfile.additionalInfo.attachmentsLink,
              })
            : null,
          ...denyReasonProps,
        });
      } else if (userRole.investorProfile) {
        profileData = new RoleProfileDto({
          id: userRole.investorProfile.id,
          licenseNumber: userRole.investorProfile.licenseNumber || undefined,
          companyName: userRole.investorProfile.companyName || undefined,
          investmentInterestId: userRole.investorProfile.investmentInterestId || undefined,
          attachmentsLink: userRole.investorProfile.attachmentsLink,
          status: userRole.status,
          additionalInfo: userRole.investorProfile.additionalInfo
            ? new AdditionalInfoDto({
                note: userRole.investorProfile.additionalInfo.note,
                userReply: userRole.investorProfile.additionalInfo.userReply,
                attachmentsLink: userRole.investorProfile.additionalInfo.attachmentsLink,
              })
            : null,
          ...denyReasonProps,
        });
      } else if (userRole.assessorProfile) {
        profileData = new RoleProfileDto({
          id: userRole.assessorProfile.id,
          certificateNumber: userRole.assessorProfile.certificateNumber || undefined,
          licenseNumber: userRole.assessorProfile.licenseNumber || undefined,
          companyName: userRole.assessorProfile.companyName || undefined,
          regionsOfPractice: userRole.assessorProfile.regionOfPractice || undefined,
          yearsOfExperience: userRole.assessorProfile.yearOfExperience || undefined,
          primaryMarket: userRole.assessorProfile.primaryMarket || undefined,
          specializationTypeId: userRole.assessorProfile.specializationTypeId || undefined,
          attachmentsLink: userRole.assessorProfile.attachmentsLink,
          status: userRole.status,
          additionalInfo: userRole.assessorProfile.additionalInfo
            ? new AdditionalInfoDto({
                note: userRole.assessorProfile.additionalInfo.note,
                userReply: userRole.assessorProfile.additionalInfo.userReply,
                attachmentsLink: userRole.assessorProfile.additionalInfo.attachmentsLink,
              })
            : null,
          ...denyReasonProps,
        });
      } else if (userRole.appraiserProfile) {
        profileData = new RoleProfileDto({
          id: userRole.appraiserProfile.id,
          certificateNumber: userRole.appraiserProfile.certificateNumber || undefined,
          licenseNumber: userRole.appraiserProfile.licenseNumber || undefined,
          companyName: userRole.appraiserProfile.companyName || undefined,
          regionsOfPractice: userRole.appraiserProfile.regionOfPractice || undefined,
          yearsOfExperience: userRole.appraiserProfile.yearOfExperience || undefined,
          primaryMarket: userRole.appraiserProfile.primaryMarket || undefined,
          specializationTypeId: userRole.appraiserProfile.specializationTypeId || undefined,
          attachmentsLink: userRole.appraiserProfile.attachmentsLink,
          status: userRole.status,
          additionalInfo: userRole.appraiserProfile.additionalInfo
            ? new AdditionalInfoDto({
                note: userRole.appraiserProfile.additionalInfo.note,
                userReply: userRole.appraiserProfile.additionalInfo.userReply,
                attachmentsLink: userRole.appraiserProfile.additionalInfo.attachmentsLink,
              })
            : null,
          ...denyReasonProps,
        });
      } else if (userRole.insuranceRepProfile) {
        profileData = new RoleProfileDto({
          id: userRole.insuranceRepProfile.id,
          licenseNumber: userRole.insuranceRepProfile.licenseNumber || undefined,
          roleTitle: userRole.insuranceRepProfile.roleTitle || undefined,
          regionsOfPractice: userRole.insuranceRepProfile.regionsOfPractice || undefined,
          yearsOfExperience: userRole.insuranceRepProfile.yearsOfExperience || undefined,
          primaryMarket: userRole.insuranceRepProfile.primaryMarket || undefined,
          coverageSpecializationTypeId:
            userRole.insuranceRepProfile.coverageSpecializationTypeId || undefined,
          attachmentsLink: userRole.insuranceRepProfile.attachmentsLink,
          status: userRole.status,
          additionalInfo: userRole.insuranceRepProfile.additionalInfo
            ? new AdditionalInfoDto({
                note: userRole.insuranceRepProfile.additionalInfo.note,
                userReply: userRole.insuranceRepProfile.additionalInfo.userReply,
                attachmentsLink: userRole.insuranceRepProfile.additionalInfo.attachmentsLink,
              })
            : null,
          ...denyReasonProps,
        });
      }

      // Only add the role if we have profile data
      if (profileData) {
        roles[userRole.role] = profileData;
      }
    });

    return new DetailedProfileDto({
      id: user?.id,
      email: user?.email,
      fullName: user?.fullName,
      roles,
      createdAt: user?.createdAt,
      updatedAt: user?.updatedAt,
    });
  }
  getAllRoles(): Promise<RoleResponseDto[]> {
    // Only return the specific roles requested
    const allowedRoles = [
      Role.BROKER,
      Role.ASSET_MANAGER,
      Role.DEVELOPER,
      Role.PROPERTY_OWNER,
      Role.LENDER,
      Role.INVESTOR,
      Role.ASSESSOR,
      Role.APPRAISER,
      Role.INSURANCE_REP,
    ];

    return Promise.resolve(
      allowedRoles.map(
        (role) =>
          new RoleResponseDto({
            value: role,
            label: role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
          }),
      ),
    );
  }

  async updateUserStatus(
    userId: number,
    updateUserStatusDto: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    try {
      // Check if user exists
      const existingUser = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: true },
      });

      if (!existingUser) {
        throw new NotFoundException('User not found');
      }

      // Check if user has the specified role
      const userRole = existingUser.userRoles.find((ur) => ur.role === updateUserStatusDto.role);
      if (!userRole) {
        throw new BadRequestException(`User does not have the role: ${updateUserStatusDto.role}`);
      }

      // Update both user profile status and role status in a transaction
      const updatedUser = await this.prisma.$transaction(async (prisma) => {
        // Update user profile status and onboarding progress
        const updateData: {
          updatedAt: Date;
          profileStatus?: UserProfileStatus;
          onboardingProgress?: number;
        } = {
          updatedAt: new Date(),
        };

        // Only set onboardingProgress to 3 if status is APPROVED
        if (updateUserStatusDto.status === UserProfileStatus.APPROVED) {
          updateData.profileStatus = UserProfileStatus.APPROVED;
          updateData.onboardingProgress = 3;
        }

        await prisma.user.update({
          where: { id: userId },
          data: updateData,
        });

        // Update the specific role status
        const roleStatus =
          updateUserStatusDto.status === UserProfileStatus.APPROVED
            ? RoleStatus.ACTIVE
            : updateUserStatusDto.status === UserProfileStatus.REJECTED
              ? RoleStatus.REJECTED
              : RoleStatus.PENDING;

        await prisma.userRole.update({
          where: {
            userId_role: {
              userId: userId,
              role: updateUserStatusDto.role,
            },
          },
          data: {
            status: roleStatus,
            denyReason: updateUserStatusDto.reason,
          },
        });

        // Return updated user with roles
        return prisma.user.findUnique({
          where: { id: userId },
          include: { userRoles: true },
        });
      });

      if (!updatedUser) {
        throw new Error('Failed to update user status');
      }

      // Send email notification after successful update
      try {
        const roleDisplayName = formatRole(updateUserStatusDto.role);

        if (updateUserStatusDto.status === UserProfileStatus.APPROVED) {
          await this.emailService.sendRoleApprovedEmail(
            updatedUser.email,
            updatedUser.fullName || 'User',
            [roleDisplayName],
          );
        } else if (updateUserStatusDto.status === UserProfileStatus.REJECTED) {
          await this.emailService.sendRoleRejectedEmail(
            updatedUser.email,
            updatedUser.fullName || 'User',
            [roleDisplayName],
            updateUserStatusDto.reason,
          );
        }
      } catch (emailError) {
        // Log email error but don't fail the operation
        console.error('Failed to send email notification:', emailError);
      }

      return new UserResponseDto({
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        roles: updatedUser.userRoles.map((ur) => ur.role),
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new BadRequestException(`Failed to update user status: ${errorMessage}`);
    }
  }
  async bulkUpdateUserRoles(
    userId: number,
    bulkUpdateDto: BulkUpdateUserRolesDto,
  ): Promise<{ message: string; updatedRoles: number }> {
    try {
      const { roles, status, reason } = bulkUpdateDto;

      // Verify user exists
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: true },
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Update only the specified roles for this user
      const updateResult = await this.prisma.userRole.updateMany({
        where: {
          role: { in: roles },
          userId,
        },
        data: {
          status,
          denyReason: reason ?? null, // ✅ put inside data
        },
      });

      await this.prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          onboardingProgress: 3,
        },
      });

      // Send email notification after successful bulk update
      try {
        const roleDisplayNames = roles.map((role) => formatRole(role));

        if (status === RoleStatus.ACTIVE) {
          await this.emailService.sendRoleApprovedEmail(
            user.email,
            user.fullName || 'User',
            roleDisplayNames,
          );
        } else if (status === RoleStatus.REJECTED) {
          await this.emailService.sendRoleRejectedEmail(
            user.email,
            user.fullName || 'User',
            roleDisplayNames,
            reason,
          );
        }
      } catch (emailError) {
        // Log email error but don't fail the operation
        console.error('Failed to send email notification:', emailError);
      }

      return {
        message: `Successfully updated ${updateResult.count} role(s) for user ${user.fullName} to ${status}`,
        updatedRoles: updateResult.count,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new BadRequestException(`Failed to bulk update user roles: ${errorMessage}`);
    }
  }

  async getUserRoles(userId: number): Promise<{ roles: Role[] }> {
    try {
      const roles = await this.prisma.userRole.findMany({
        where: { userId },
        select: {
          role: true,
        },
      });
      return { roles: roles.map((r) => r.role) };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new BadRequestException(`Failed to update user roles: ${errorMessage}`);
    }
  }

  async updateUserRoles(userId: number, roles: Role[]): Promise<UserResponseDto> {
    try {
      // Verify user exists
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Delete all existing roles for the user
      await this.prisma.userRole.deleteMany({
        where: { userId },
      });

      // Create new roles with PENDING status (default for new users)
      const newRoles = roles.map((role) => ({
        userId,
        role,
        status: 'PENDING' as const,
      }));

      await this.prisma.userRole.createMany({
        data: newRoles,
      });

      // Return updated user
      const updatedUser = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: true },
      });

      if (!updatedUser) {
        throw new Error('User not found after role update');
      }

      return new UserResponseDto({
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        roles: updatedUser.userRoles.map((ur) => ur.role),
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new BadRequestException(`Failed to update user roles: ${errorMessage}`);
    }
  }

  async requestAdditionalInfo(
    userId: number,
    role: string,
    note: string,
  ): Promise<{ success: boolean; message: string; data?: ProfileWithUserRole }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return {
          success: false,
          message: `User with ID ${userId} not found`,
        };
      }

      const userRole = await this.prisma.userRole.findUnique({
        where: {
          userId_role: {
            userId: userId,
            role: role as Role,
          },
        },
      });

      if (!userRole) {
        return {
          success: false,
          message: `User ${userId} does not have the role: ${role}`,
        };
      }

      let existingProfile: ProfileWithAdditionalInfo | null = null;
      switch (role) {
        case Role.BROKER:
          existingProfile = await this.prisma.brokerProfile.findUnique({
            where: { userRoleId: userRole.id },
            include: { additionalInfo: true },
          });
          break;
        case Role.ASSET_MANAGER:
          existingProfile = await this.prisma.assetManagerProfile.findUnique({
            where: { userRoleId: userRole.id },
            include: { additionalInfo: true },
          });
          break;
        case Role.DEVELOPER:
          existingProfile = await this.prisma.developerProfile.findUnique({
            where: { userRoleId: userRole.id },
            include: { additionalInfo: true },
          });
          break;
        case Role.PROPERTY_OWNER:
          existingProfile = await this.prisma.propertyOwnerProfile.findUnique({
            where: { userRoleId: userRole.id },
            include: { additionalInfo: true },
          });
          break;
        case Role.LENDER:
          existingProfile = await this.prisma.lenderProfile.findUnique({
            where: { userRoleId: userRole.id },
            include: { additionalInfo: true },
          });
          break;
        case Role.INVESTOR:
          existingProfile = await this.prisma.investorProfile.findUnique({
            where: { userRoleId: userRole.id },
            include: { additionalInfo: true },
          });
          break;
        case Role.ASSESSOR:
          existingProfile = await this.prisma.assessorProfile.findUnique({
            where: { userRoleId: userRole.id },
            include: { additionalInfo: true },
          });
          break;
        case Role.APPRAISER:
          existingProfile = await this.prisma.appraiserProfile.findUnique({
            where: { userRoleId: userRole.id },
            include: { additionalInfo: true },
          });
          break;
        case Role.INSURANCE_REP:
          existingProfile = await this.prisma.insuranceRepProfile.findUnique({
            where: { userRoleId: userRole.id },
            include: { additionalInfo: true },
          });
          break;
        default:
          return {
            success: false,
            message: `Role ${role} does not have a profile that supports additional info requests`,
          };
      }

      if (!existingProfile) {
        return {
          success: false,
          message: `No ${role.toLowerCase()} profile found for user ${userId}`,
        };
      }

      if (existingProfile.additionalInfo) {
        return {
          success: false,
          message: `Additional info request already exists for user ${userId} with role ${role}`,
        };
      }

      const result = await this.prisma.$transaction(async (tx): Promise<ProfileWithUserRole> => {
        const additionalInfo = await tx.userAdditionalInfo.create({
          data: {
            note: note,
            userReply: '',
            attachmentsLink: [],
          },
        });

        await tx.userRole.update({
          where: { id: userRole.id },
          data: { status: RoleStatus.ADDITIONAL_INFO_REQUESTED as RoleStatus },
        });

        switch (role) {
          case Role.BROKER:
            return await tx.brokerProfile.update({
              where: { id: existingProfile.id },
              data: { additionalInfoId: additionalInfo.id },
              include: {
                userRole: {
                  include: {
                    user: {
                      select: { id: true, fullName: true, email: true },
                    },
                  },
                },
                additionalInfo: true,
              },
            });
          case Role.ASSET_MANAGER:
            return await tx.assetManagerProfile.update({
              where: { id: existingProfile.id },
              data: { additionalInfoId: additionalInfo.id },
              include: {
                userRole: {
                  include: {
                    user: {
                      select: { id: true, fullName: true, email: true },
                    },
                  },
                },
                additionalInfo: true,
              },
            });
          case Role.DEVELOPER:
            return await tx.developerProfile.update({
              where: { id: existingProfile.id },
              data: { additionalInfoId: additionalInfo.id },
              include: {
                userRole: {
                  include: {
                    user: {
                      select: { id: true, fullName: true, email: true },
                    },
                  },
                },
                additionalInfo: true,
              },
            });
          case Role.PROPERTY_OWNER:
            return await tx.propertyOwnerProfile.update({
              where: { id: existingProfile.id },
              data: { additionalInfoId: additionalInfo.id },
              include: {
                userRole: {
                  include: {
                    user: {
                      select: { id: true, fullName: true, email: true },
                    },
                  },
                },
                additionalInfo: true,
              },
            });
          case Role.LENDER:
            return await tx.lenderProfile.update({
              where: { id: existingProfile.id },
              data: { additionalInfoId: additionalInfo.id },
              include: {
                userRole: {
                  include: {
                    user: {
                      select: { id: true, fullName: true, email: true },
                    },
                  },
                },
                additionalInfo: true,
              },
            });

          case Role.INVESTOR:
            return await tx.investorProfile.update({
              where: { id: existingProfile.id },
              data: { additionalInfoId: additionalInfo.id },
              include: {
                userRole: {
                  include: {
                    user: {
                      select: { id: true, fullName: true, email: true },
                    },
                  },
                },
                additionalInfo: true,
              },
            });

          case Role.ASSESSOR:
            return await tx.assessorProfile.update({
              where: { id: existingProfile.id },
              data: { additionalInfoId: additionalInfo.id },
              include: {
                userRole: {
                  include: {
                    user: {
                      select: { id: true, fullName: true, email: true },
                    },
                  },
                },
                additionalInfo: true,
              },
            });

          case Role.APPRAISER:
            return await tx.appraiserProfile.update({
              where: { id: existingProfile.id },
              data: { additionalInfoId: additionalInfo.id },
              include: {
                userRole: {
                  include: {
                    user: {
                      select: { id: true, fullName: true, email: true },
                    },
                  },
                },
                additionalInfo: true,
              },
            });

          case Role.INSURANCE_REP:
            return await tx.insuranceRepProfile.update({
              where: { id: existingProfile.id },
              data: { additionalInfoId: additionalInfo.id },
              include: {
                userRole: {
                  include: {
                    user: {
                      select: { id: true, fullName: true, email: true },
                    },
                  },
                },
                additionalInfo: true,
              },
            });
          default:
            throw new Error(`Unsupported role`);
        }
      });

      try {
        await this.emailService.sendAdditionalInfoRequest(
          result.userRole.user.email,
          result.userRole.user.fullName || 'User',
          role,
          note,
        );
      } catch (emailError) {
        throw new Error(`Failed to send email notification: ${emailError}`);
      }

      return {
        success: true,
        message: `Additional info has been requested for user: ${result.userRole.user.fullName} (ID: ${userId}) with role: ${role}`,
        data: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Error in requestAdditionalInfo: ${errorMessage}`);
    }
  }

  async setLastUsedRole(
    userId: number,
    role: Role,
  ): Promise<{ selectedRole: Role; accessToken: string }> {
    const roleId = await this.getUserRoleId(userId, role);

    const [user, userRole] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { lastUsedRoleId: roleId },
        select: {
          id: true,
          email: true,
          fullName: true,
          isInvited: true,
          onboardingProgress: true,
          userRoles: {
            select: {
              role: true,
            },
          },
        },
      }),
      this.prisma.userRole.findUnique({
        where: { id: roleId },
        select: {
          role: true,
        },
      }),
    ]);

    if (!user) {
      throw new Error('User not found');
    }

    if (!userRole) {
      throw new Error('Failed to set last used role');
    }

    const payload = {
      sub: user.id,
      email: user.email,

      roles: user.userRoles.map((ur: UserRole) => ur.role),
      selectedRole: role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      selectedRole: userRole.role,
      accessToken,
    };
  }

  private async getUserRoleId(userId: number, role: Role) {
    const userRole = await this.prisma.userRole.findUniqueOrThrow({
      where: { userId_role: { userId, role } },
    });
    return userRole.id;
  }

  async updateProfile(userId: number, updateData: UpdateProfileDto): Promise<UserResponseDto> {
    try {
      // 1. Build update data object with only provided fields
      const userUpdateData: Partial<{
        fullName: string;
        email: string;
        phone: string;
        profileImageUrl: string;
        updatedAt: Date;
      }> = {
        updatedAt: new Date(),
      };

      // Only include fields that are actually being updated
      if (updateData.fullName !== undefined) userUpdateData.fullName = updateData.fullName;
      if (updateData.email !== undefined) userUpdateData.email = updateData.email;
      if (updateData.phone !== undefined) userUpdateData.phone = updateData.phone;
      if (updateData.profileImageUrl !== undefined)
        userUpdateData.profileImageUrl = updateData.profileImageUrl;

      // 2. Update user basic data
      await this.prisma.user.update({
        where: { id: userId },
        data: userUpdateData,
      });

      // 3. Update company in role profile if provided
      if (updateData.company !== undefined) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          include: { lastUsedRole: true },
        });

        if (user?.lastUsedRole?.role) {
          const userRole = await this.prisma.userRole.findFirst({
            where: { userId, role: user.lastUsedRole.role },
          });

          if (userRole) {
            await this.updateCompanyInRoleProfile(
              userRole.id,
              user.lastUsedRole.role,
              updateData.company,
            );
          }
        }
      }

      // 4. Return updated user data using existing method
      const updatedUser = await this.findUserById(userId);

      if (!updatedUser) {
        throw new Error('User not found after update');
      }

      // Convert the Prisma user to UserResponseDto format
      const userRoles = updatedUser.userRoles.map((ur) => ur.role);
      const userResponse = new UserResponseDto({
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.fullName || undefined,
        roles: userRoles,
        onboardingProgress: updatedUser.onboardingProgress,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
        selectedRole: updatedUser.lastUsedRole?.role ?? userRoles[0],
        profileStatus: updatedUser.profileStatus,
        profileImageUrl: updatedUser.profileImageUrl ? updatedUser.profileImageUrl : undefined,
        // Company information will be undefined since we don't have profile data in this simple query
        company: undefined,
      });

      return userResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Failed to update profile: ${errorMessage}`);
    }
  }

  private async updateCompanyInRoleProfile(
    userRoleId: number,
    role: Role,
    companyName: string,
  ): Promise<void> {
    const updateData = { companyName };

    switch (role) {
      case Role.BROKER:
        await this.prisma.brokerProfile.upsert({
          where: { userRoleId },
          update: updateData,
          create: { userRoleId, ...updateData },
        });
        break;
      case Role.ASSET_MANAGER:
        await this.prisma.assetManagerProfile.upsert({
          where: { userRoleId },
          update: updateData,
          create: { userRoleId, ...updateData },
        });
        break;
      case Role.PROPERTY_OWNER:
        await this.prisma.propertyOwnerProfile.upsert({
          where: { userRoleId },
          update: updateData,
          create: { userRoleId, ...updateData },
        });
        break;
      case Role.DEVELOPER:
        await this.prisma.developerProfile.upsert({
          where: { userRoleId },
          update: updateData,
          create: { userRoleId, ...updateData },
        });
        break;
      case Role.LENDER:
        await this.prisma.lenderProfile.upsert({
          where: { userRoleId },
          update: updateData,
          create: { userRoleId, ...updateData },
        });
        break;
      case Role.INVESTOR:
        await this.prisma.investorProfile.upsert({
          where: { userRoleId },
          update: updateData,
          create: { userRoleId, ...updateData },
        });
        break;
      case Role.ASSESSOR:
        await this.prisma.assessorProfile.upsert({
          where: { userRoleId },
          update: updateData,
          create: { userRoleId, ...updateData },
        });
        break;
      case Role.APPRAISER:
        await this.prisma.appraiserProfile.upsert({
          where: { userRoleId },
          update: updateData,
          create: { userRoleId, ...updateData },
        });
        break;
      case Role.INSURANCE_REP:
        // InsuranceRepProfile doesn't have companyName field
        break;
    }
  }
}
