import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { RoleResponseDto } from './dto/roles-response.dto';
import { Prisma, Role, RoleStatus, User } from '@prisma/client';
import { UserRole as PrismaUserRole } from '@prisma/client';
import { ERROR_MESSAGES } from 'src/common/constants';
import * as bcrypt from 'bcryptjs';
import { Profile, ProfilePromise } from './interfaces/profile.interface';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(createUserDto: CreateUserDto, assignedById?: number): Promise<UserResponseDto> {
    const { email, roles, isInvited, password, fullName } = createUserDto;
    const hashedPassword = await bcrypt.hash(password, 10);

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException(ERROR_MESSAGES.EMAIL_EXISTS_ERROR);
    }

    let finalRoles: Role[];

    if (isInvited) {
      finalRoles = roles || [];
    } else {
      finalRoles = roles && roles.length > 0 ? roles : [Role.VIEWER];
    }

    return this.prisma.$transaction(async (prisma) => {
      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          fullName: fullName,
          isInvited: isInvited || false,
          refreshToken: null,
          refreshTokenExpires: null,
        },
      });

      // Create user roles data
      if (finalRoles && finalRoles.length > 0) {
        const userRolesData = finalRoles.map((role) => ({
          userId: user.id,
          role,
          status: isInvited ? RoleStatus.ACTIVE : RoleStatus.PENDING,
          assignedAt: new Date(),
          assignedBy: isInvited ? assignedById : user.id,
        }));

        // Create roles
        const createdRoles = await Promise.all(
          userRolesData.map((roleData) =>
            prisma.userRole.create({
              data: roleData,
            }),
          ),
        );

        // Create profiles for roles that need them
        await this.createProfilesForRoles(prisma, createdRoles);
      }

      // Fetch complete user data with roles
      const userWithRoles = await prisma.user.findUnique({
        where: { id: user.id },
        include: { userRoles: true },
      });

      if (!userWithRoles) {
        throw new Error('User creation failed');
      }

      return new UserResponseDto({
        id: userWithRoles.id,
        email: userWithRoles.email,
        fullName: userWithRoles.fullName,
        roles: userWithRoles.userRoles.map((ur) => ur.role),
        createdAt: userWithRoles.createdAt,
        updatedAt: userWithRoles.updatedAt,
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
      case Role.PROJECT_OWNER:
        return prisma.projectOwnerProfile.create({ data: { userRoleId } });
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

  async findAll(role?: Role): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      where: role
        ? {
            userRoles: {
              some: {
                role: role, // Filter users who have at least one userRole with the specified role
              },
            },
          }
        : undefined,
      include: {
        userRoles: true, // Include userRoles to map to roles in DTO
      },
    });

    return users.map(
      (user) =>
        new UserResponseDto({
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roles: user.userRoles.map((ur) => ur.role),
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
      },
    });

    if (!user) {
      return null;
    }

    // Convert the Prisma user to UserResponseDto format
    return new UserResponseDto({
      id: user.id,
      email: user.email,
      fullName: user.fullName || undefined,
      roles: user.userRoles.map((ur) => ur.role),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  async findUserById(id: number): Promise<(User & { userRoles: PrismaUserRole[] }) | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: true,
      },
    });
  }

  getAllRoles(): Promise<RoleResponseDto[]> {
    // Only return the specific roles requested
    const allowedRoles = [
      Role.ADMIN,
      Role.BROKER,
      Role.ASSET_MANAGER,
      Role.DEVELOPER,
      Role.PROJECT_OWNER,
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
}
