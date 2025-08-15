import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { Role, User } from '@prisma/client';
import { ERROR_MESSAGES } from 'src/common/constants';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const { email } = createUserDto;
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const existing = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });
    if (existing) {
      throw new ConflictException(ERROR_MESSAGES.EMAIL_EXISTS_ERROR);
    }

    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
        refreshToken: null,
        refreshTokenExpires: null
      },
    });
    return new UserResponseDto(user);
  }

  async findAll(role?: Role): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      where: role ? { role } : undefined,
    });
    return users.map((user) => new UserResponseDto(user));
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findUserById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
  
}
